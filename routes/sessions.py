import os
import uuid
import shutil
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from auth import get_current_user
from models import ClassGroup, Course, Enrollment, User, VideoSession, get_db

try:
    from services.youtube_live import create_live_broadcast, end_live_broadcast
except Exception:
    def create_live_broadcast(title, description=""):
        return {}
    def end_live_broadcast(broadcast_id):
        return None


router = APIRouter(prefix="/api/sessions", tags=["sessions"])

# ── Dossier de stockage des enregistrements ────────
RECORDINGS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)

BACKEND_URL = os.getenv("BACKEND_URL", "")   # ex: https://votre-domaine.com


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


def _recording_url_from_filename(filename: str) -> str:
    """Construit l'URL publique d'un enregistrement local."""
    if BACKEND_URL:
        return f"{BACKEND_URL}/api/sessions/recordings/{filename}"
    return f"/api/sessions/recordings/{filename}"


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
    recording_url:        Optional[str]  = None
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
    return sessions


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

    if not session.youtube_broadcast_id or not session.youtube_stream_key:
        try:
            youtube = create_live_broadcast(
                session.title,
                f"Cours UniLearn: {session.title}",
            )
            session.youtube_broadcast_id = youtube.get("broadcast_id")
            session.youtube_live_url     = youtube.get("live_url")
            session.youtube_stream_key   = youtube.get("stream_key")
            session.youtube_video_id     = youtube.get("video_id")
        except Exception:
            # YouTube non configuré → session Jitsi sans streaming YouTube
            pass

    session.room_id       = session.room_id or uuid.uuid4().hex
    session.is_active     = True
    session.is_recording  = True    # on indique que l'enregistrement local est attendu
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

    recording_url = None
    try:
        recording_url = end_live_broadcast(session.youtube_broadcast_id)
    except Exception:
        pass

    session.is_active    = False
    session.is_recording = False
    session.ended_at     = datetime.utcnow()
    # On conserve l'URL existante si déjà uploadée (enregistrement local)
    session.recording_url = (
        recording_url
        or session.recording_url
        or session.youtube_live_url
    )

    db.commit()
    db.refresh(session)
    session.teacher_name = me.name
    return session


# ── Upload enregistrement local (MediaRecorder) ────
#
# Le navigateur du prof envoie le blob WebM/MP4 capturé par MediaRecorder.
# Le fichier est stocké dans uploads/recordings/ et l'URL est sauvegardée
# dans VideoSession.recording_url pour être affichée aux étudiants.

@router.post("/{session_id}/recording", response_model=SessionOut)
async def upload_recording(
    session_id: int,
    file: UploadFile = File(...),
    db:   Session    = Depends(get_db),
    me:   User       = Depends(get_current_user),
):
    if me.role not in ("teacher", "admin"):
        raise HTTPException(403, "Accès réservé aux enseignants")

    session = db.query(VideoSession).filter(VideoSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session introuvable")
    _ensure_session_access(session, me, db, manage=True)

    # Valider le type de fichier
    allowed_types = {"video/webm", "video/mp4", "video/ogg", "application/octet-stream"}
    allowed_exts  = {".webm", ".mp4", ".ogg", ".mkv"}
    ext = os.path.splitext(file.filename or "")[1].lower() or ".webm"

    if file.content_type not in allowed_types and ext not in allowed_exts:
        raise HTTPException(400, f"Format non supporté : {file.content_type}")

    # Supprimer l'ancien enregistrement si présent
    if session.recording_url:
        old_filename = session.recording_url.split("/")[-1]
        old_path = os.path.join(RECORDINGS_DIR, old_filename)
        if os.path.exists(old_path):
            os.remove(old_path)

    # Sauvegarder le nouveau fichier
    filename = f"session_{session_id}_{uuid.uuid4().hex[:8]}{ext}"
    dest     = os.path.join(RECORDINGS_DIR, filename)

    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Mettre à jour la session
    session.recording_url = _recording_url_from_filename(filename)
    session.is_active     = False
    session.is_recording  = False
    if not session.ended_at:
        session.ended_at = datetime.utcnow()

    db.commit()
    db.refresh(session)
    session.teacher_name = me.name
    return session


# ── Servir les fichiers d'enregistrement ──────────
#
# Endpoint pour streamer les vidéos enregistrées avec support Range
# (nécessaire pour que le player HTML5 puisse scrubber la vidéo).

from fastapi.responses import StreamingResponse
from fastapi import Request

@router.get("/recordings/{filename}")
def serve_recording(
    filename: str,
    request:  Request,
    db:       Session = Depends(get_db),
    me:       User    = Depends(get_current_user),
):
    # Sécurité : empêcher la traversée de répertoire
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "Nom de fichier invalide")

    path = os.path.join(RECORDINGS_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(404, "Enregistrement introuvable")

    file_size  = os.path.getsize(path)
    ext        = os.path.splitext(filename)[1].lower()
    media_type = "video/mp4" if ext == ".mp4" else "video/webm"

    range_header = request.headers.get("Range")
    if range_header:
        try:
            parts = range_header.replace("bytes=", "").split("-")
            start = int(parts[0])
            end   = int(parts[1]) if parts[1] else file_size - 1
        except Exception:
            start, end = 0, file_size - 1

        end = min(end, file_size - 1)

        def iter_range(s, e):
            with open(path, "rb") as f:
                f.seek(s)
                remaining = e - s + 1
                while remaining > 0:
                    data = f.read(min(65536, remaining))
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return StreamingResponse(
            iter_range(start, end), status_code=206,
            media_type=media_type,
            headers={
                "Content-Range":  f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges":  "bytes",
                "Content-Length": str(end - start + 1),
            },
        )

    def iter_full():
        with open(path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        iter_full(), media_type=media_type,
        headers={
            "Accept-Ranges":  "bytes",
            "Content-Length": str(file_size),
        },
    )


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

    # Supprimer le fichier d'enregistrement local si présent
    if session.recording_url and "/recordings/" in session.recording_url:
        filename = session.recording_url.split("/")[-1]
        path = os.path.join(RECORDINGS_DIR, filename)
        if os.path.exists(path):
            os.remove(path)

    db.delete(session)
    db.commit()
