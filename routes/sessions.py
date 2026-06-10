import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from auth import get_current_user
from models import ClassGroup, Course, Enrollment, User, VideoSession, get_db

try:
    from services.daily_video import (
        create_daily_room,
        create_owner_token,
        create_participant_token,
        delete_daily_room,
    )
    DAILY_ENABLED = True
except Exception:
    DAILY_ENABLED = False
    def create_daily_room(name): return {"url": "", "name": name}
    def create_owner_token(name, user=""): return ""
    def create_participant_token(name, user=""): return ""
    def delete_daily_room(name): pass


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


def _prepare_session_out(session: VideoSession, me: User, fallback: str = "") -> VideoSession:
    session.teacher_name = (
        session.course.teacher.name
        if session.course and session.course.teacher
        else fallback
    )
    if me.role == "student":
        session.youtube_stream_key = None
    return session


# ── Schémas ───────────────────────────────────────

class SessionIn(BaseModel):
    course_id:    int
    title:        str
    scheduled_at: Optional[datetime] = None

class SessionOut(BaseModel):
    id: int; course_id: int; teacher_id: int
    title: str; room_id: str
    scheduled_at:         Optional[datetime]
    is_active:            bool
    ended_at:             Optional[datetime]
    youtube_stream_key:   Optional[str] = None
    youtube_live_url:     Optional[str] = None
    youtube_video_id:     Optional[str] = None
    youtube_broadcast_id: Optional[str] = None
    is_recording:         Optional[bool] = False
    recording_url:        Optional[str] = None
    created_at:           datetime
    teacher_name:         str = ""
    class Config:
        from_attributes = True


# ── Liste des sessions d'un cours ─────────────────

@router.get("/course/{course_id}", response_model=List[SessionOut])
def list_sessions(
    course_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
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
        _prepare_session_out(s, me)
    return sessions  # FIX: return manquant


# ── Récupérer une session par salle ────────────────

@router.get("/room/{room_id}", response_model=SessionOut)
def get_session_by_room(
    room_id: str,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    session = db.query(VideoSession).filter(VideoSession.room_id == room_id).first()
    if not session:
        raise HTTPException(404, "Session introuvable")
    _ensure_session_access(session, me, db)
    return _prepare_session_out(session, me, me.name)


# ── Créer une session (enseignant/admin) ──────────

@router.post("", response_model=SessionOut, status_code=201)
def create_session(
    body: SessionIn,
    db:   Session = Depends(get_db),
    me:   User    = Depends(get_current_user),
):
    if me.role not in ("teacher", "admin"):
        raise HTTPException(403, "Accès refusé")
    course = db.query(Course).filter(Course.id == body.course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    _ensure_course_access(course, me, db, manage=True)

    session = VideoSession(
        course_id    = body.course_id,
        teacher_id   = me.id,
        title        = body.title,
        room_id      = uuid.uuid4().hex,
        scheduled_at = body.scheduled_at,
        is_active    = False,
        is_recording = False,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    session.teacher_name = me.name
    return session


# ── Démarrer une session ───────────────────────────

@router.post("/{session_id}/start", response_model=SessionOut)
def start_session(
    session_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    session = db.query(VideoSession).filter(VideoSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session introuvable")
    _ensure_session_access(session, me, db, manage=True)

    # Créer la salle Daily.co si elle n'existe pas encore
    room_name = f"unilearn-{session.room_id}"
    try:
        daily = create_daily_room(room_name)
        session.youtube_live_url = daily.get("url")  # on réutilise ce champ pour l'URL Daily
    except Exception:
        pass  # si Daily échoue on continue quand même

    session.room_id       = session.room_id or uuid.uuid4().hex
    session.is_active     = True
    session.is_recording  = False
    session.ended_at      = None
    session.recording_url = None

    db.commit()
    db.refresh(session)
    session.teacher_name = me.name
    return session


# ── Terminer une session ───────────────────────────

@router.post("/{session_id}/end", response_model=SessionOut)
def end_session(
    session_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    session = db.query(VideoSession).filter(VideoSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session introuvable")
    _ensure_session_access(session, me, db, manage=True)

    session.is_active    = False
    session.is_recording = False
    session.ended_at     = datetime.utcnow()
    # recording_url déjà mis à jour par l'endpoint /recording

    db.commit()
    db.refresh(session)
    session.teacher_name = me.name
    return session


# ── Supprimer une session ──────────────────────────

@router.delete("/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    session = db.query(VideoSession).filter(VideoSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session introuvable")
    _ensure_session_access(session, me, db, manage=True)
    db.delete(session)
    db.commit()


# ── Upload enregistrement local ────────────────────

from fastapi import UploadFile, File
import uuid as _uuid
import os as _os

RECORDING_DIR = _os.path.join(_os.path.dirname(__file__), "..", "uploads", "recordings")

@router.post("/{session_id}/recording", response_model=SessionOut)
async def upload_recording(
    session_id: int,
    file:       UploadFile = File(...),
    db:         Session    = Depends(get_db),
    me:         User       = Depends(get_current_user),
):
    session = db.query(VideoSession).filter(VideoSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session introuvable")
    _ensure_session_access(session, me, db, manage=True)

    # Sauvegarder le fichier
    _os.makedirs(RECORDING_DIR, exist_ok=True)
    ext      = _os.path.splitext(file.filename or "recording.webm")[1].lower() or ".webm"
    filename = f"rec_{session_id}_{_uuid.uuid4().hex[:8]}{ext}"
    dest     = _os.path.join(RECORDING_DIR, filename)

    with open(dest, "wb") as f:
        content = await file.read()
        f.write(content)

    # Sauvegarder l'URL en BDD
    session.recording_url = f"/uploads/recordings/{filename}"
    session.is_active     = False
    session.ended_at      = session.ended_at or __import__('datetime').datetime.utcnow()
    db.commit()
    db.refresh(session)
    session.teacher_name = me.name
    return session


# ── Générer un token Daily.co ──────────────────────
# GET /api/sessions/{session_id}/token
# Retourne un token Daily owner (prof) ou participant (étudiant)

@router.get("/{session_id}/token")
def get_daily_token(
    session_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    session = db.query(VideoSession).filter(VideoSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session introuvable")
    _ensure_session_access(session, me, db)

    room_name = f"unilearn-{session.room_id}"

    # S'assurer que la salle existe
    try:
        create_daily_room(room_name)
    except Exception:
        pass

    is_owner = me.role in ("teacher", "admin")
    try:
        if is_owner:
            token = create_owner_token(room_name, me.name)
        else:
            token = create_participant_token(room_name, me.name)
    except Exception as e:
        raise HTTPException(500, f"Erreur Daily.co : {str(e)}")

    daily_url = f"https://unilearn.daily.co/{room_name}"
    return {
        "token":      token,
        "room_url":   daily_url,
        "room_name":  room_name,
        "is_owner":   is_owner,
    }
