from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List

from models import Course, Category, Enrollment, Lesson, Progress, User, get_db
from auth import get_current_user

router = APIRouter(prefix="/api/courses", tags=["courses"])


# ── Schémas ───────────────────────────────────────

class CategoryOut(BaseModel):
    id: int; name: str; color: str; icon: str
    class Config: from_attributes = True

class LessonOut(BaseModel):
    id: int; title: str; type: str
    duration: str | None; order: int
    description: str | None; file_path: str | None
    class Config: from_attributes = True

class CourseOut(BaseModel):
    id: int; title: str; description: str | None
    thumbnail: str | None; is_published: bool
    teacher_id: int; teacher_name: str = ""
    category: CategoryOut | None
    lesson_count:  int   = 0
    student_count: int   = 0      # ✅ nombre d'inscrits
    enrolled:      bool  = False
    progress_pct:  float = 0.0
    class Config: from_attributes = True

class CourseListOut(BaseModel):
    items: List[CourseOut]
    total: int
    page:  int
    pages: int


# ── Helper ────────────────────────────────────────

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
        "id": course.id, "title": course.title,
        "description": course.description, "thumbnail": course.thumbnail,
        "is_published": course.is_published, "teacher_id": course.teacher_id,
        "teacher_name":  course.teacher.name if course.teacher else "",
        "category":      course.category,
        "lesson_count":  len(lessons),
        "student_count": student_count,
        "enrolled":      enrollment is not None,
        "progress_pct":  round(done / len(lessons) * 100, 1) if lessons else 0.0,
    }


# ── GET /courses ──────────────────────────────────

@router.get("", response_model=List[CourseOut])
def list_courses(
    search: Optional[str] = Query(None, description="Filtre par titre"),
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    if me.role == "admin":
        q = db.query(Course)
    elif me.role == "teacher":
        q = db.query(Course).filter(Course.teacher_id == me.id)
    else:
        ids = [e.course_id for e in db.query(Enrollment).filter_by(student_id=me.id).all()]
        if not ids:
            return []
        q = db.query(Course).filter(Course.id.in_(ids))

    # ✅ Recherche par titre (insensible à la casse)
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
        courses = db.query(Course).filter(Course.teacher_id == me.id).order_by(Course.created_at.desc()).all()
    else:
        ids = [e.course_id for e in db.query(Enrollment).filter_by(student_id=me.id).all()]
        if not ids:
            return []
        courses = db.query(Course).filter(Course.id.in_(ids)).order_by(Course.created_at.desc()).all()
    return [_enrich(c, me.id, db) for c in courses]


# ── GET /courses/:id ──────────────────────────────

@router.get("/{course_id}", response_model=CourseOut)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    if me.role == "teacher" and course.teacher_id != me.id:
        raise HTTPException(403, "Ce cours ne vous est pas assigné")
    if me.role == "student":
        enrolled = db.query(Enrollment).filter_by(student_id=me.id, course_id=course_id).first()
        if not enrolled:
            raise HTTPException(403, "Vous n'êtes pas inscrit à ce cours")
    return _enrich(course, me.id, db)


# ── GET /courses/:id/lessons ──────────────────────

@router.get("/{course_id}/lessons", response_model=List[LessonOut])
def get_lessons(
    course_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    if me.role == "teacher" and course.teacher_id != me.id:
        raise HTTPException(403, "Ce cours ne vous est pas assigné")
    if me.role == "student":
        enrolled = db.query(Enrollment).filter_by(student_id=me.id, course_id=course_id).first()
        if not enrolled:
            raise HTTPException(403, "Vous n'êtes pas inscrit à ce cours")
    return (
        db.query(Lesson)
        .filter(Lesson.course_id == course_id)
        .order_by(Lesson.order)
        .all()
    )


# ── Inscription désactivée (admin seulement) ──────

@router.post("/{course_id}/enroll", status_code=403)
def enroll_forbidden():
    raise HTTPException(403, "Les inscriptions sont gérées par l'administrateur")
