from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional, List

from models import Course, Category, ClassGroup, Enrollment, Lesson, Progress, User, get_db
from auth import get_current_user

router = APIRouter(prefix="/api/courses", tags=["courses"])


# ── Schémas ───────────────────────────────────────

class CategoryOut(BaseModel):
    id: int
    name: str
    color: str
    icon: str
    class Config:
        from_attributes = True

class LessonOut(BaseModel):
    id: int
    title: str
    content_type: str | None = None
    duration_min: int | None = None
    order: int
    description: str | None = None
    file_url: str | None = None
    is_free: bool = False
    class Config:
        from_attributes = True

    @classmethod
    def from_orm_lesson(cls, lesson: "Lesson") -> "LessonOut":
        file_url = (
            getattr(lesson, 'file_url',  None) or
            getattr(lesson, 'file_path', None) or
            getattr(lesson, 'video_url', None)
        )
        content_type = (
            getattr(lesson, 'content_type', None) or
            getattr(lesson, 'type', None)
        )
        duration_min = getattr(lesson, 'duration_min', None)
        if duration_min is None:
            raw = getattr(lesson, 'duration', None)
            if isinstance(raw, int):
                duration_min = raw
            elif isinstance(raw, str) and raw.isdigit():
                duration_min = int(raw)

        return cls(
            id=lesson.id,
            title=lesson.title,
            content_type=content_type,
            duration_min=duration_min,
            order=getattr(lesson, 'order', 0),
            description=getattr(lesson, 'description', None),
            file_url=file_url,
            is_free=getattr(lesson, 'is_free', False),
        )

class CourseOut(BaseModel):
    id: int
    title: str
    description: str | None = None
    thumbnail: str | None = None
    is_published: bool
    teacher_id: int
    teacher_name: str = ""
    category_id: int | None = None
    category: CategoryOut | None = None
    lesson_count:  int   = 0
    student_count: int   = 0
    enrolled:      bool  = False
    progress_pct:  float = 0.0
    class_group_id: int | None = None
    class_group_name: str = ""
    class Config:
        from_attributes = True


# ── Helper accès cours ────────────────────────────

def _teacher_can_view_course(course: Course, teacher_id: int, db: Session) -> bool:
    if course.teacher_id == teacher_id:
        return True
    if not course.class_group_id:
        return False

    class_group = db.query(ClassGroup).filter(ClassGroup.id == course.class_group_id).first()
    if not class_group:
        return False
    if class_group.teacher_id == teacher_id:
        return True

    return db.query(Course.id).filter(
        Course.class_group_id == course.class_group_id,
        Course.teacher_id == teacher_id,
    ).first() is not None


def _can_view_course(course: Course, me: User, db: Session) -> bool:
    if me.role == "admin":
        return True
    if me.role == "teacher":
        return _teacher_can_view_course(course, me.id, db)
    return db.query(Enrollment.id).filter_by(
        student_id=me.id,
        course_id=course.id,
    ).first() is not None


def _ensure_can_view_course(course: Course, me: User, db: Session) -> None:
    if not _can_view_course(course, me, db):
        if me.role == "teacher":
            raise HTTPException(403, "Ce cours n'appartient pas à une classe que vous pouvez consulter")
        raise HTTPException(403, "Vous n'êtes pas inscrit à ce cours")


# ── Helper enrichissement ─────────────────────────

def _enrich(course: Course, user_id: int, db: Session) -> dict:
    lessons    = db.query(Lesson).filter(Lesson.course_id == course.id).all()
    enrollment = db.query(Enrollment).filter_by(student_id=user_id, course_id=course.id).first()
    done = 0
    if enrollment and lessons:
        done = db.query(Progress).filter(
            Progress.user_id == user_id,
            Progress.lesson_id.in_([l.id for l in lessons]),
            Progress.completed == True,
        ).count()
    student_count = db.query(Enrollment).filter_by(course_id=course.id).count()
    return {
        "id":            course.id,
        "title":         course.title,
        "description":   course.description,
        "thumbnail":     course.thumbnail,
        "is_published":  course.is_published,
        "teacher_id":    course.teacher_id,
        "teacher_name":  course.teacher.name if course.teacher else "",
        "category_id":   course.category_id,
        "category":      course.category,
        "lesson_count":  len(lessons),
        "student_count": student_count,
        "enrolled":      enrollment is not None,
        "progress_pct":  round(done / len(lessons) * 100, 1) if lessons else 0.0,
        "class_group_id": getattr(course, 'class_group_id', None),
        "class_group_name": course.class_group.name if course.class_group else "",
    }


# ── GET /courses ──────────────────────────────────

@router.get("", response_model=List[CourseOut])
def list_courses(
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    if me.role == "admin":
        q = db.query(Course)
    elif me.role == "teacher":
        # Un enseignant peut voir ses propres cours et les cours des classes
        # dont il est titulaire (ClassGroup.teacher_id).
        class_group_ids = [
            row[0] for row in db.query(ClassGroup.id)
            .filter(ClassGroup.teacher_id == me.id)
            .all()
        ]
        q = db.query(Course).filter(
            (Course.teacher_id == me.id)
            | (Course.class_group_id.in_(class_group_ids) if class_group_ids else False)
        )
    else:
        ids = [e.course_id for e in db.query(Enrollment).filter_by(student_id=me.id).all()]
        if not ids:
            return []
        q = db.query(Course).filter(Course.id.in_(ids))

    if search and search.strip():
        q = q.filter(Course.title.ilike(f"%{search.strip()}%"))

    courses = q.order_by(Course.created_at.desc()).all()
    return [_enrich(c, me.id, db) for c in courses]


# ── GET /courses/my ───────────────────────────────

@router.get("/my", response_model=List[CourseOut])
def my_courses(
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    if me.role == "admin":
        courses = db.query(Course).order_by(Course.created_at.desc()).all()
    elif me.role == "teacher":
        class_group_ids = [
            row[0] for row in db.query(ClassGroup.id)
            .filter(ClassGroup.teacher_id == me.id)
            .all()
        ]
        courses = db.query(Course).filter(
            (Course.teacher_id == me.id)
            | (Course.class_group_id.in_(class_group_ids) if class_group_ids else False)
        ).order_by(Course.created_at.desc()).all()
    else:
        ids = [e.course_id for e in db.query(Enrollment).filter_by(student_id=me.id).all()]
        if not ids:
            return []
        courses = db.query(Course).filter(
            Course.id.in_(ids)
        ).order_by(Course.created_at.desc()).all()
    return [_enrich(c, me.id, db) for c in courses]


# ── GET /courses/:id ──────────────────────────────
# CORRECTION : admin a toujours accès total

@router.get("/{course_id}", response_model=CourseOut)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")

    _ensure_can_view_course(course, me, db)
    return _enrich(course, me.id, db)


# ── GET /courses/:id/lessons ──────────────────────

@router.get("/{course_id}/lessons", response_model=List[LessonOut])
def get_lessons(
    course_id: int,
    db: Session  = Depends(get_db),
    me: User     = Depends(get_current_user),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")

    _ensure_can_view_course(course, me, db)

    lessons = (
        db.query(Lesson)
        .filter(Lesson.course_id == course_id)
        .order_by(Lesson.order)
        .all()
    )
    return [LessonOut.from_orm_lesson(l) for l in lessons]


# ── POST /courses/:id/enroll ──────────────────────

@router.post("/{course_id}/enroll")
def enroll(
    course_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    if me.role != "student":
        raise HTTPException(403, "Seuls les étudiants peuvent s'inscrire")

    course = db.query(Course).filter(
        Course.id == course_id, Course.is_published == True
    ).first()
    if not course:
        raise HTTPException(404, "Cours introuvable ou non publié")

    existing = db.query(Enrollment).filter_by(
        student_id=me.id, course_id=course_id
    ).first()
    if existing:
        raise HTTPException(400, "Vous êtes déjà inscrit à ce cours")

    db.add(Enrollment(student_id=me.id, course_id=course_id))
    db.commit()
    return {"message": "Inscription réussie"}
