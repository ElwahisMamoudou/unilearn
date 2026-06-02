import os, uuid, random
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from models import get_db, User, Course, ClassGroup, Enrollment, Lesson, Exam
from auth import require_admin, hash_password
from email_service import send_account_created, send_password_reset

router = APIRouter(prefix="/api/admin", tags=["admin"])


def generate_password(length: int = 10) -> str:
    letters_up  = "ABCDEFGHJKMNPQRSTUVWXYZ"
    letters_low = "abcdefghjkmnpqrstuvwxyz"
    digits      = "23456789"
    specials    = "@#$%!?"
    pwd = [
        random.choice(letters_up),
        random.choice(letters_low),
        random.choice(digits),
        random.choice(specials),
    ]
    all_chars = letters_up + letters_low + digits + specials
    pwd += [random.choice(all_chars) for _ in range(length - 4)]
    random.shuffle(pwd)
    return "".join(pwd)


class UserOut(BaseModel):
    id: int; name: str; email: str; role: str
    is_active: bool; created_at: datetime
    class Config: from_attributes = True

class UserCreateOut(BaseModel):
    id: int; name: str; email: str; role: str
    is_active: bool; created_at: datetime
    password:   str
    email_sent: bool
    class Config: from_attributes = True

class UserCreate(BaseModel):
    name:  str
    email: EmailStr
    role:  str = "student"

class UserUpdate(BaseModel):
    name:      Optional[str]  = None
    role:      Optional[str]  = None
    is_active: Optional[bool] = None

class CourseAdminIn(BaseModel):
    title:          str
    description:    Optional[str] = None
    category_id:    Optional[int] = None
    teacher_id:     int
    is_published:   bool = False
    class_id:       Optional[int] = None
    class_group_id: Optional[int] = None

class CourseTeacherAssignIn(BaseModel):
    teacher_id: int

class CourseOut(BaseModel):
    id: int; title: str; description: Optional[str]
    is_published: bool; teacher_id: int
    teacher_name: str = ""; category_name: str = ""
    lesson_count: int = 0; student_count: int = 0
    thumbnail:    Optional[str] = None
    class_group_id: Optional[int] = None
    class_id:       Optional[int] = None
    class Config: from_attributes = True

class EnrollIn(BaseModel):
    student_ids: List[int]

class StatsOut(BaseModel):
    total_users: int; total_students: int; total_teachers: int
    total_courses: int; total_lessons: int
    total_enrollments: int; total_exams: int


@router.get("/stats", response_model=StatsOut)
def get_stats(db: Session = Depends(get_db), me: User = Depends(require_admin)):
    return StatsOut(
        total_users       = db.query(User).count(),
        total_students    = db.query(User).filter_by(role="student").count(),
        total_teachers    = db.query(User).filter_by(role="teacher").count(),
        total_courses     = db.query(Course).count(),
        total_lessons     = db.query(Lesson).count(),
        total_enrollments = db.query(Enrollment).count(),
        total_exams       = db.query(Exam).count(),
    )


@router.get("/users", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), me: User = Depends(require_admin)):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.post("/users", response_model=UserCreateOut, status_code=201)
def create_user(
    body: UserCreate,
    db:   Session = Depends(get_db),
    me:   User    = Depends(require_admin),
):
    if db.query(User).filter_by(email=body.email).first():
        raise HTTPException(400, "Cet email est déjà utilisé")
    if body.role not in ("student", "teacher", "admin"):
        raise HTTPException(400, "Rôle invalide")

    plain_pwd = generate_password()
    user = User(
        name       = body.name.strip(),
        email      = body.email,
        hashed_pwd = hash_password(plain_pwd),
        role       = body.role,
    )
    db.add(user); db.commit(); db.refresh(user)

    email_sent = False
    try:
        email_sent = send_account_created(
            to_email  = user.email,
            full_name = user.name,
            role      = user.role,
            password  = plain_pwd,
        )
    except Exception:
        pass

    return UserCreateOut(
        id=user.id, name=user.name, email=user.email,
        role=user.role, is_active=user.is_active,
        created_at=user.created_at,
        password=plain_pwd,
        email_sent=email_sent,
    )


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body:    UserUpdate,
    db:      Session = Depends(get_db),
    me:      User    = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    if user.id == me.id and body.role and body.role != "admin":
        raise HTTPException(400, "Vous ne pouvez pas changer votre propre rôle")
    if body.name      is not None: user.name      = body.name.strip()
    if body.role      is not None: user.role      = body.role
    if body.is_active is not None: user.is_active = body.is_active
    db.commit(); db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db:      Session = Depends(get_db),
    me:      User    = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    if user.id == me.id:
        raise HTTPException(400, "Vous ne pouvez pas supprimer votre propre compte")
    db.delete(user); db.commit()


@router.post("/users/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    db:      Session = Depends(get_db),
    me:      User    = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    if user.id == me.id:
        raise HTTPException(400, "Utilisez 'Mon profil' pour changer votre propre mot de passe")

    new_pwd = generate_password()
    user.hashed_pwd = hash_password(new_pwd)
    db.commit()

    email_sent = False
    try:
        email_sent = send_password_reset(
            to_email     = user.email,
            full_name    = user.name,
            new_password = new_pwd,
        )
    except Exception:
        pass

    return {
        "ok":         True,
        "user_id":    user.id,
        "user_name":  user.name,
        "user_email": user.email,
        "password":   new_pwd,
        "email_sent": email_sent,
    }


@router.get("/courses", response_model=List[CourseOut])
def list_all_courses(db: Session = Depends(get_db), me: User = Depends(require_admin)):
    return [CourseOut(
        id=c.id, title=c.title, description=c.description,
        is_published=c.is_published, teacher_id=c.teacher_id,
        teacher_name   = c.teacher.name  if c.teacher  else "",
        category_name  = c.category.name if c.category else "",
        lesson_count   = len(c.lessons),
        student_count  = len(c.enrollments),
        thumbnail      = c.thumbnail,
        class_group_id = c.class_group_id,
        class_id       = c.class_group_id,
    ) for c in db.query(Course).all()]


@router.post("/courses", response_model=CourseOut, status_code=201)
def admin_create_course(
    body: CourseAdminIn,
    db:   Session = Depends(get_db),
    me:   User    = Depends(require_admin),
):
    teacher = db.query(User).filter(User.id == body.teacher_id, User.role == "teacher").first()
    if not teacher:
        raise HTTPException(404, "Enseignant introuvable")

    class_group_id = body.class_group_id or body.class_id  # FIX: était indenté sous le raise
    if class_group_id and not db.query(ClassGroup.id).filter(ClassGroup.id == class_group_id).first():
        raise HTTPException(404, "Classe introuvable")

    course = Course(
        title          = body.title,
        description    = body.description,
        category_id    = body.category_id,
        teacher_id     = body.teacher_id,
        is_published   = body.is_published,
        class_group_id = class_group_id,
    )
    db.add(course); db.commit(); db.refresh(course)
    return CourseOut(
        id=course.id, title=course.title, description=course.description,
        is_published=course.is_published, teacher_id=course.teacher_id,
        teacher_name   = teacher.name,
        category_name  = course.category.name if course.category else "",
        lesson_count   = 0,
        student_count  = 0,
        thumbnail      = None,
        class_group_id = course.class_group_id,
        class_id       = course.class_group_id,
    )


@router.put("/courses/{course_id}", response_model=CourseOut)
def admin_update_course(
    course_id: int,
    body:      CourseAdminIn,
    db:        Session = Depends(get_db),
    me:        User    = Depends(require_admin),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    teacher = db.query(User).filter(User.id == body.teacher_id, User.role == "teacher").first()
    if not teacher:
        raise HTTPException(404, "Enseignant introuvable")

    class_group_id = body.class_group_id or body.class_id
    if class_group_id and not db.query(ClassGroup.id).filter(ClassGroup.id == class_group_id).first():
        raise HTTPException(404, "Classe introuvable")

    course.title          = body.title
    course.description    = body.description
    course.category_id    = body.category_id
    course.teacher_id     = body.teacher_id
    course.is_published   = body.is_published
    course.class_group_id = class_group_id
    db.commit(); db.refresh(course)
    return CourseOut(
        id=course.id, title=course.title, description=course.description,
        is_published=course.is_published, teacher_id=course.teacher_id,
        teacher_name   = teacher.name,
        category_name  = course.category.name if course.category else "",
        lesson_count   = len(course.lessons),
        student_count  = len(course.enrollments),
        thumbnail      = course.thumbnail,
        class_group_id = course.class_group_id,
        class_id       = course.class_group_id,
    )


@router.patch("/courses/{course_id}/teacher", response_model=CourseOut)
def admin_assign_course_teacher(
    course_id: int,
    body:      CourseTeacherAssignIn,
    db:        Session = Depends(get_db),
    me:        User    = Depends(require_admin),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    teacher = db.query(User).filter(User.id == body.teacher_id, User.role == "teacher").first()
    if not teacher:
        raise HTTPException(404, "Enseignant introuvable")
    course.teacher_id = teacher.id
    db.commit(); db.refresh(course)
    return CourseOut(
        id=course.id, title=course.title, description=course.description,
        is_published=course.is_published, teacher_id=course.teacher_id,
        teacher_name   = teacher.name,
        category_name  = course.category.name if course.category else "",
        lesson_count   = len(course.lessons),
        student_count  = len(course.enrollments),
        thumbnail      = course.thumbnail,
        class_group_id = course.class_group_id,
        class_id       = course.class_group_id,
    )


@router.delete("/courses/{course_id}", status_code=204)
def admin_delete_course(
    course_id: int,
    db:        Session = Depends(get_db),
    me:        User    = Depends(require_admin),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    db.delete(course); db.commit()


@router.get("/courses/{course_id}/students", response_model=List[UserOut])
def list_enrolled(course_id: int, db: Session = Depends(get_db), me: User = Depends(require_admin)):
    return [e.student for e in db.query(Enrollment).filter_by(course_id=course_id).all() if e.student]


@router.post("/courses/{course_id}/enroll", status_code=201)
def admin_enroll(
    course_id: int,
    body:      EnrollIn,
    db:        Session = Depends(get_db),
    me:        User    = Depends(require_admin),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    enrolled, already = [], []
    for sid in body.student_ids:
        student = db.query(User).filter(User.id == sid, User.role == "student").first()
        if not student: continue
        if db.query(Enrollment).filter_by(student_id=sid, course_id=course_id).first():
            already.append(sid); continue
        db.add(Enrollment(student_id=sid, course_id=course_id))
        enrolled.append(sid)
    db.commit()
    return {"enrolled": enrolled, "already_enrolled": already}


@router.delete("/courses/{course_id}/students/{student_id}", status_code=204)
def admin_unenroll(
    course_id: int, student_id: int,
    db:        Session = Depends(get_db),
    me:        User    = Depends(require_admin),
):
    e = db.query(Enrollment).filter_by(course_id=course_id, student_id=student_id).first()
    if not e:
        raise HTTPException(404, "Inscription introuvable")
    db.delete(e); db.commit()


THUMB_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "thumbnails")

@router.post("/courses/{course_id}/thumbnail")
async def upload_course_thumbnail(
    course_id: int,
    file:      UploadFile = File(...),
    db:        Session    = Depends(get_db),
    me:        User       = Depends(require_admin),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")

    allowed = ["image/jpeg", "image/png", "image/webp"]
    if file.content_type not in allowed:
        raise HTTPException(400, "Format non supporté. Utilisez JPG, PNG ou WebP")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image trop lourde (max 5 Mo)")

    os.makedirs(THUMB_DIR, exist_ok=True)

    if course.thumbnail:
        old_path = os.path.join(THUMB_DIR, os.path.basename(course.thumbnail))
        if os.path.exists(old_path):
            os.remove(old_path)

    ext      = os.path.splitext(file.filename or "image.jpg")[1].lower() or ".jpg"
    filename = f"thumb_{course_id}_{uuid.uuid4().hex[:8]}{ext}"
    with open(os.path.join(THUMB_DIR, filename), "wb") as f:
        f.write(contents)

    course.thumbnail = f"/uploads/thumbnails/{filename}"
    db.commit()
    return {"thumbnail": course.thumbnail, "ok": True}


@router.delete("/courses/{course_id}/thumbnail", status_code=204)
def delete_course_thumbnail(
    course_id: int,
    db:        Session = Depends(get_db),
    me:        User    = Depends(require_admin),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    if course.thumbnail:
        old_path = os.path.join(THUMB_DIR, os.path.basename(course.thumbnail))
        if os.path.exists(old_path):
            os.remove(old_path)
        course.thumbnail = None
        db.commit()
