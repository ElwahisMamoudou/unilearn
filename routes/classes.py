from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from models import get_db, User, ClassGroup, AcademicYear, Enrollment, Course, Exam, Homework
from auth import get_current_user, require_admin

router = APIRouter(prefix="/api/classes", tags=["classes"])


# ── Schémas ───────────────────────────────────────
class StudentOut(BaseModel):
    id: int; name: str; email: str
    matricule: Optional[str] = None
    is_active: bool
    class Config: from_attributes = True

class ClassOut(BaseModel):
    id: int; name: str; code: Optional[str]
    description: Optional[str]; level: Optional[str]
    academic_year_id: Optional[int]; academic_year_name: str = ""
    teacher_id: Optional[int]; teacher_name: str = ""
    max_students: int; is_active: bool
    student_count: int = 0; created_at: datetime
    class Config: from_attributes = True

class ClassIn(BaseModel):
    name:             str
    code:             Optional[str] = None
    description:      Optional[str] = None
    level:            Optional[str] = None
    academic_year_id: Optional[int] = None
    teacher_id:       Optional[int] = None
    max_students:     int = 50
    is_active:        bool = True

class EnrollStudentsIn(BaseModel):
    student_ids: List[int]


# ── Helper ────────────────────────────────────────
def _enrich(cg: ClassGroup) -> dict:
    return {
        "id":                cg.id,
        "name":              cg.name,
        "code":              cg.code,
        "description":       cg.description,
        "level":             cg.level,
        "academic_year_id":  cg.academic_year_id,
        "academic_year_name": cg.academic_year.name if cg.academic_year else "",
        "teacher_id":        cg.teacher_id,
        "teacher_name":      cg.teacher.name if cg.teacher else "",
        "max_students":      cg.max_students,
        "is_active":         cg.is_active,
        "student_count":     len(cg.students),
        "created_at":        cg.created_at,
    }


# ── CRUD Classes ──────────────────────────────────
@router.get("", response_model=List[ClassOut])
def list_classes(
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    if me.role == "admin":
        classes = db.query(ClassGroup).order_by(ClassGroup.name).all()
    elif me.role == "teacher":
        # Enseignant voit ses classes + celles où ses étudiants sont
        classes = db.query(ClassGroup).filter(
            ClassGroup.teacher_id == me.id
        ).order_by(ClassGroup.name).all()
    else:
        # Étudiant voit ses classes
        classes = me.class_groups
    return [_enrich(c) for c in classes]


@router.get("/{class_id}", response_model=ClassOut)
def get_class(
    class_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    cg = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not cg:
        raise HTTPException(404, "Classe introuvable")

    # Cours dont les etudiants de cette classe sont inscrits
    # (ou cours assignes a l'enseignant responsable de la classe)
    course_ids = set()
    for student in cg.students:
        for enrollment in db.query(Enrollment).filter_by(student_id=student.id).all():
            course_ids.add(enrollment.course_id)
    if cg.teacher_id:
        teacher_courses = db.query(Course).filter_by(teacher_id=cg.teacher_id).all()
        for c in teacher_courses:
            course_ids.add(c.id)

    courses = []
    for cid in course_ids:
        c = db.query(Course).filter_by(id=cid).first()
        if c:
            lesson_count   = len(c.lessons) if hasattr(c, 'lessons') else 0
            student_count  = db.query(Enrollment).filter_by(course_id=c.id).count()
            teacher_name   = c.teacher.name if c.teacher else ''
            category_name  = c.category.name if hasattr(c, 'category') and c.category else ''
            category_color = c.category.color if hasattr(c, 'category') and c.category else '#6366f1'
            courses.append({
                'id':           c.id,
                'title':        c.title,
                'description':  c.description,
                'is_published': c.is_published,
                'teacher_id':   c.teacher_id,
                'teacher_name': teacher_name,
                'category_name':  category_name,
                'category_color': category_color,
                'lesson_count':   lesson_count,
                'student_count':  student_count,
            })

    # Examens lies aux cours de la classe
    exams = []
    for c in courses:
        for ex in db.query(Exam).filter_by(course_id=c['id']).all():
            sub_count = len(ex.submissions) if hasattr(ex, 'submissions') else 0
            exams.append({
                'id':               ex.id,
                'title':            ex.title,
                'course_id':        ex.course_id,
                'is_published':     ex.is_published,
                'starts_at':        ex.starts_at.isoformat() if ex.starts_at else None,
                'ends_at':          ex.ends_at.isoformat()   if ex.ends_at   else None,
                'submission_count': sub_count,
            })

    # Devoirs lies aux cours de la classe
    homeworks = []
    for c in courses:
        for hw in db.query(Homework).filter_by(course_id=c['id']).all():
            sub_count = len(hw.submissions) if hasattr(hw, 'submissions') else 0
            homeworks.append({
                'id':               hw.id,
                'title':            hw.title,
                'course_id':        hw.course_id,
                'is_published':     hw.is_published,
                'due_date':         hw.due_date.isoformat() if hw.due_date else None,
                'max_score':        hw.max_score,
                'submission_count': sub_count,
            })

    base = _enrich(cg)
    base['courses']   = courses
    base['students']  = [
        {
            'id':        s.id,
            'name':      s.name,
            'email':     s.email,
            'matricule': s.matricule if hasattr(s, 'matricule') else None,
            'is_active': s.is_active,
        }
        for s in cg.students
    ]
    base['exams']     = exams
    base['homeworks'] = homeworks
    base['stats']     = {
        'total_students':  len(cg.students),
        'total_courses':   len(courses),
        'total_exams':     len(exams),
        'total_homeworks': len(homeworks),
    }
    base['academic_year_name'] = cg.academic_year.name if cg.academic_year else ''
    return base


@router.post("", status_code=201)
def create_class(
    body: ClassIn,
    db:   Session = Depends(get_db),
    me:   User    = Depends(require_admin),
):
    # Vérifier enseignant si fourni
    if body.teacher_id:
        teacher = db.query(User).filter(User.id == body.teacher_id, User.role == "teacher").first()
        if not teacher:
            raise HTTPException(404, "Enseignant introuvable")

    cg = ClassGroup(
        name=body.name, code=body.code,
        description=body.description, level=body.level,
        academic_year_id=body.academic_year_id,
        teacher_id=body.teacher_id,
        max_students=body.max_students,
        is_active=body.is_active,
    )
    db.add(cg); db.commit(); db.refresh(cg)
    return _enrich(cg)


@router.put("/{class_id}")
def update_class(
    class_id: int,
    body:     ClassIn,
    db:       Session = Depends(get_db),
    me:       User    = Depends(require_admin),
):
    cg = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not cg:
        raise HTTPException(404, "Classe introuvable")

    if body.teacher_id:
        teacher = db.query(User).filter(User.id == body.teacher_id, User.role == "teacher").first()
        if not teacher:
            raise HTTPException(404, "Enseignant introuvable")

    cg.name             = body.name
    cg.code             = body.code
    cg.description      = body.description
    cg.level            = body.level
    cg.academic_year_id = body.academic_year_id
    cg.teacher_id       = body.teacher_id
    cg.max_students     = body.max_students
    cg.is_active        = body.is_active
    db.commit(); db.refresh(cg)
    return _enrich(cg)


@router.delete("/{class_id}", status_code=204)
def delete_class(
    class_id: int,
    db:       Session = Depends(get_db),
    me:       User    = Depends(require_admin),
):
    cg = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not cg:
        raise HTTPException(404, "Classe introuvable")
    db.delete(cg); db.commit()


# ── Étudiants d'une classe ────────────────────────
@router.get("/{class_id}/students", response_model=List[StudentOut])
def list_students(
    class_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    cg = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not cg:
        raise HTTPException(404, "Classe introuvable")
    return cg.students


@router.post("/{class_id}/students")
def add_students(
    class_id: int,
    body:     EnrollStudentsIn,
    db:       Session = Depends(get_db),
    me:       User    = Depends(require_admin),
):
    cg = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not cg:
        raise HTTPException(404, "Classe introuvable")

    if len(cg.students) + len(body.student_ids) > cg.max_students:
        raise HTTPException(400, f"Capacité max atteinte ({cg.max_students} étudiants)")

    added = []
    already = []
    for sid in body.student_ids:
        student = db.query(User).filter(User.id == sid, User.role == "student").first()
        if not student:
            continue
        if student in cg.students:
            already.append(sid)
            continue
        cg.students.append(student)
        added.append(sid)

    db.commit()
    return {"added": added, "already_in_class": already}


@router.delete("/{class_id}/students/{student_id}", status_code=204)
def remove_student(
    class_id:   int,
    student_id: int,
    db:         Session = Depends(get_db),
    me:         User    = Depends(require_admin),
):
    cg = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not cg:
        raise HTTPException(404, "Classe introuvable")
    student = db.query(User).filter(User.id == student_id).first()
    if not student or student not in cg.students:
        raise HTTPException(404, "Étudiant non trouvé dans cette classe")
    cg.students.remove(student)
    db.commit()


# ── Inscrire toute une classe à un cours ──────────
@router.post("/{class_id}/enroll-course/{course_id}")
def enroll_class_to_course(
    class_id:  int,
    course_id: int,
    db:        Session = Depends(get_db),
    me:        User    = Depends(require_admin),
):
    """Inscrit tous les étudiants d'une classe à un cours d'un seul coup."""
    cg = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not cg:
        raise HTTPException(404, "Classe introuvable")
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")

    if not cg.students:
        raise HTTPException(400, "Aucun etudiant dans cette classe. Ajoutez des etudiants avant d'inscrire.")

    enrolled = []; already = []
    for student in cg.students:
        try:
            existing = db.query(Enrollment).filter_by(
                student_id=student.id, course_id=course_id
            ).first()
            if existing:
                already.append(student.id)
            else:
                db.add(Enrollment(student_id=student.id, course_id=course_id))
                enrolled.append(student.id)
        except Exception:
            db.rollback()
            raise HTTPException(500, f"Erreur lors de l'inscription de l'etudiant {student.id}")

    db.commit()
    return {
        "class":    cg.name,
        "course":   course.title,
        "enrolled": len(enrolled),
        "already":  len(already),
    }


# ── Matricule ─────────────────────────────────────
@router.patch("/students/{student_id}/matricule")
def set_matricule(
    student_id: int,
    matricule:  str,
    db:         Session = Depends(get_db),
    me:         User    = Depends(require_admin),
):
    student = db.query(User).filter(User.id == student_id, User.role == "student").first()
    if not student:
        raise HTTPException(404, "Étudiant introuvable")
    existing = db.query(User).filter(User.matricule == matricule, User.id != student_id).first()
    if existing:
        raise HTTPException(400, f"Matricule '{matricule}' déjà utilisé")
    student.matricule = matricule
    db.commit()
    return {"ok": True, "matricule": matricule}