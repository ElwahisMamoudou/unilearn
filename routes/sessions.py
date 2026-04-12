import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from models import get_db, User, Course, Enrollment, VideoSession
from auth import get_current_user, require_teacher

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


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
    if me.role == "teacher" and course.teacher_id != me.id:
        raise HTTPException(403, "Ce cours ne vous appartient pas")

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
    if me.role not in ("admin",) and s.teacher_id != me.id:
        raise HTTPException(403, "Seul l'enseignant peut démarrer la session")
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
    if me.role not in ("admin",) and s.teacher_id != me.id:
        raise HTTPException(403, "Seul l'enseignant peut terminer la session")
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
    if me.role not in ("admin",) and s.teacher_id != me.id:
        raise HTTPException(403, "Accès refusé")
    db.delete(s); db.commit()
