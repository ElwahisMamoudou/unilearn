import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from models import get_db, User, Course, ClassGroup, Enrollment, VideoSession
from auth import get_current_user, require_teacher

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

def _teacher_can_manage_course(course: Course, teacher_id: int, db: Session) -> bool:
    if course.teacher_id == teacher_id:
        return True
    if not course.class_group_id:
        return False
    class_group = db.query(ClassGroup).filter(ClassGroup.id == course.class_group_id).first()
    if class_group and class_group.teacher_id == teacher_id:
        return True
    return db.query(Course.id).filter(
        Course.class_group_id == course.class_group_id,
        Course.teacher_id == teacher_id,
    ).first() is not None


def _ensure_course_access(course: Course, me: User, db: Session, manage: bool = False) -> None:
    if me.role == "admin":
        return
    if me.role == "teacher":
        if _teacher_can_manage_course(course, me.id, db):
            return
        raise HTTPException(403, "Ce cours ne vous appartient pas")
    if manage:
        raise HTTPException(403, "Accès réservé aux enseignants")
    enrolled = db.query(Enrollment.id).filter_by(student_id=me.id, course_id=course.id).first()
    if not enrolled:
        raise HTTPException(403, "Vous n'êtes pas inscrit à ce cours")


def _ensure_session_access(session: VideoSession, me: User, db: Session, manage: bool = False) -> None:
    course = db.query(Course).filter(Course.id == session.course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    _ensure_course_access(course, me, db, manage=manage)


# ── Schémas ───────────────────────────────────────
class SessionIn(BaseModel):
    course_id:    int
    title:        str
    scheduled_at: Optional[datetime] = None

class SessionOut(BaseModel):
    id: int; course_id: int; teacher_id: int
    title: str; room_id: str
    scheduled_at: Optional[datetime]
    is_active: bool; ended_at: Optional[datetime]
    created_at: datetime
    teacher_name: str = ""
    class Config: from_attributes = True


# ── Liste des sessions d'un cours ─────────────────
@router.get("/course/{course_id}", response_model=List[SessionOut])
def list_sessions(
    course_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")

    _ensure_course_access(course, me, db)
        
    sessions = (
        db.query(VideoSession)
        .filter(VideoSession.course_id == course_id)
        .order_by(VideoSession.created_at.desc())
        .all()
    )
    for s in sessions:
        s.teacher_name = s.course.teacher.name if s.course and s.course.teacher else ""
    return sessions


# ── Créer une session (enseignant/admin) ──────────
@router.post("", response_model=SessionOut, status_code=201)
def create_session(
    body: SessionIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    if me.role not in ("teacher", "admin"):
        raise HTTPException(403, "Accès refusé")

    course = db.query(Course).filter(Course.id == body.course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
   _ensure_course_access(course, me, db, manage=True)

    room_id = uuid.uuid4().hex  # identifiant unique de la salle

    session = VideoSession(
        course_id=body.course_id,
        teacher_id=me.id,
        title=body.title,
        room_id=room_id,
        scheduled_at=body.scheduled_at,
        is_active=False,
    )
    db.add(session); db.commit(); db.refresh(session)
    session.teacher_name = me.name
    return session


# ── Démarrer une session ───────────────────────────
@router.post("/{session_id}/start", response_model=SessionOut)
def start_session(
    session_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    s = db.query(VideoSession).filter(VideoSession.id == session_id).first()
    if not s:
        raise HTTPException(404, "Session introuvable")
    _ensure_session_access(s, me, db, manage=True)
    s.is_active = True
    s.ended_at  = None
    db.commit(); db.refresh(s)
    s.teacher_name = me.name
    return s


# ── Terminer une session ───────────────────────────
@router.post("/{session_id}/end", response_model=SessionOut)
def end_session(
    session_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    s = db.query(VideoSession).filter(VideoSession.id == session_id).first()
    if not s:
        raise HTTPException(404, "Session introuvable")
   _ensure_session_access(s, me, db, manage=True)
    s.is_active = False
    s.ended_at  = datetime.utcnow()
    db.commit(); db.refresh(s)
    s.teacher_name = me.name
    return s


# ── Supprimer une session ──────────────────────────
@router.delete("/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    s = db.query(VideoSession).filter(VideoSession.id == session_id).first()
    if not s:
        raise HTTPException(404, "Session introuvable")
   _ensure_session_access(s, me, db, manage=True)
    db.delete(s); db.commit()
