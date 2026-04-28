from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional, List

from models import Course, Category, Enrollment, Lesson, Progress, User, get_db
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
    content_type: str | None = None   # ✅ vrai nom du champ dans le modèle
    duration_min: int | None = None   # ✅ vrai nom du champ
    order: int
    description: str | None = None
    file_url: str | None = None       # ✅ renommé file_path → file_url pour le frontend
    is_free: bool = False
    class Config:
        from_attributes = True

    @classmethod
    def from_orm_lesson(cls, lesson: "Lesson") -> "LessonOut":
        """
        Adapte le modèle ORM : mappe file_path → file_url
        et gère les champs qui peuvent avoir des noms différents selon ta version du modèle.
        """
        # file_path ou video_url ou file_url — on prend le premier non-null
        file_url = (
            getattr(lesson, 'file_url',  None) or
            getattr(lesson, 'file_path', None) or
            getattr(lesson, 'video_url', None)
        )
        # content_type ou type
        content_type = (
            getattr(lesson, 'content_type', None) or
            getattr(lesson, 'type', None)
        )
        # duration_min ou duration (si duration est un int/str)
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
    class Config:
        from_attributes = True


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
        q = db.query(Course).filter(Course.teacher_id == me.id)
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
        courses = db.query(Course).filter(
            Course.teacher_id == me.id
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
        enrolled = db.query(Enrollment).filter_by(
            student_id=me.id, course_id=course_id
        ).first()
        if not enrolled:
            raise HTTPException(403, "Vous n'êtes pas inscrit à ce cours")
    return _enrich(course, me.id, db)


# ── GET /courses/:id/lessons ──────────────────────
# ✅ CORRECTION PRINCIPALE :
#    - Retourne file_url (mappé depuis file_path si nécessaire)
#    - Admin voit toujours les leçons (pour ClassDetail / AdminDashboard)
#    - Teacher voit ses propres cours
#    - Student doit être inscrit

@router.get("/{course_id}/lessons", response_model=List[LessonOut])
def get_lessons(
    course_id: int,
    db: Session  = Depends(get_db),
    me: User     = Depends(get_current_user),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")

    # ✅ Admin : accès total
    if me.role == "admin":
        pass

    # ✅ Teacher : seulement ses propres cours
    elif me.role == "teacher":
        if course.teacher_id != me.id:
            raise HTTPException(403, "Ce cours ne vous est pas assigné")

    # ✅ Student : doit être inscrit au cours
    else:
        enrolled = db.query(Enrollment).filter_by(
            student_id=me.id, course_id=course_id
        ).first()
        if not enrolled:
            raise HTTPException(403, "Vous n'êtes pas inscrit à ce cours")

    lessons = (
        db.query(Lesson)
        .filter(Lesson.course_id == course_id)
        .order_by(Lesson.order)
        .all()
    )

    # ✅ Utiliser le mapper qui gère file_path → file_url
    return [LessonOut.from_orm_lesson(l) for l in lessons]


# ── POST /courses/:id/enroll ──────────────────────
# Désactivé — les inscriptions passent par l'admin

@router.post("/{course_id}/enroll", status_code=403)
def enroll_forbidden():
    raise HTTPException(
        403,
        "Les inscriptions sont gérées par l'administrateur"
    )
