import os, shutil, uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, Query
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from models import Lesson, Course, ClassGroup, Enrollment, Progress, User, get_db
from auth import get_current_user, require_teacher, verify_token

router = APIRouter(prefix="/api/lessons", tags=["lessons"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED = {
    "pdf":   ["application/pdf"],
    "video": ["video/mp4", "video/webm", "video/ogg", "video/mpeg", "video/quicktime"],
}


def _file_type(content_type: str | None, filename: str | None = None) -> str | None:
    for typ, mimes in ALLOWED.items():
        if content_type in mimes:
            return typ

    # Certains navigateurs/OS envoient application/octet-stream ou un type vide
    # pour les vidéos. On accepte alors les extensions connues.
    ext = os.path.splitext(filename or "")[1].lower()
    if ext == ".pdf":
        return "pdf"
    if ext in {".mp4", ".webm", ".ogg", ".mpeg", ".mpg", ".mov"}:
        return "video"
    return None


def _extract_youtube_id(url: str) -> str | None:
    """
    Extrait le video_id depuis les formats d'URL YouTube courants :
      - https://www.youtube.com/watch?v=VIDEO_ID
      - https://youtu.be/VIDEO_ID
      - https://www.youtube.com/embed/VIDEO_ID
      - https://www.youtube.com/shorts/VIDEO_ID
    Retourne None si l'URL n'est pas reconnue.
    """
    import re
    patterns = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


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


def _ensure_can_view_lesson(lesson: Lesson, me: User, db: Session) -> Course:
    course = db.query(Course).filter(Course.id == lesson.course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    if not _can_view_course(course, me, db):
        raise HTTPException(403, "Vous n'avez pas accès à cette leçon")
    return course


# ── Schémas ───────────────────────────────────────
class ProgressIn(BaseModel):
    completed:   bool = False
    last_page:   int  = 0
    watched_sec: int  = 0

class ProgressOut(BaseModel):
    lesson_id:   int
    completed:   bool
    last_page:   int
    watched_sec: int
    class Config: from_attributes = True

class LessonOut(BaseModel):
    id: int
    course_id: int
    title: str
    description: str | None
    type: str
    file_path: str | None
    youtube_url: str | None   # ← URL YouTube (option B)
    duration: str | None
    order: int
    class Config: from_attributes = True


# ── Upload — enseignant assigné au cours ──────────
@router.post("/upload", response_model=LessonOut, status_code=201)
async def upload_lesson(
    course_id:   int                    = Form(...),
    title:       str                    = Form(...),
    description: str                    = Form(""),
    duration:    str                    = Form(""),
    order:       int                    = Form(0),
    youtube_url: Optional[str]          = Form(None),   # ← URL YouTube
    file:        Optional[UploadFile]   = File(None),   # ← fichier désormais optionnel
    db:          Session                = Depends(get_db),
    me:          User                   = Depends(require_teacher),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")

    if me.role == "teacher" and not _teacher_can_view_course(course, me.id, db):
        raise HTTPException(403, "Ce cours ne vous est pas assigné — vous ne pouvez pas y ajouter de leçons")

    has_file = file is not None and file.filename
    has_yt   = bool(youtube_url and youtube_url.strip())

    if not has_file and not has_yt:
        raise HTTPException(400, "Fournissez un fichier (PDF/vidéo) ou une URL YouTube")

    if has_file and has_yt:
        raise HTTPException(400, "Fournissez soit un fichier, soit une URL YouTube, pas les deux")

    filename_saved = None
    file_type      = None

    if has_file:
        file_type = _file_type(file.content_type, file.filename)
        if not file_type:
            raise HTTPException(400, f"Type non supporté : {file.content_type}")

        ext      = os.path.splitext(file.filename or "")[1].lower()
        fname    = f"{uuid.uuid4().hex}{ext}"
        dest     = os.path.join(UPLOAD_DIR, fname)
        with open(dest, "wb") as f_out:
            shutil.copyfileobj(file.file, f_out)
        filename_saved = fname

    elif has_yt:
        yt_clean = youtube_url.strip()
        if not _extract_youtube_id(yt_clean):
            raise HTTPException(400, "URL YouTube non reconnue. Formats acceptés : youtube.com/watch?v=..., youtu.be/..., shorts/...")
        file_type   = "youtube"
        youtube_url = yt_clean

    lesson = Lesson(
        course_id   = course_id,
        title       = title,
        description = description or None,
        type        = file_type,
        file_path   = filename_saved,
        youtube_url = youtube_url if has_yt else None,
        duration    = duration or None,
        order       = order,
    )
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return lesson


# ── Supprimer une leçon ───────────────────────────
@router.delete("/{lesson_id}", status_code=204)
def delete_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(require_teacher),
):
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(404, "Leçon introuvable")

    course = db.query(Course).filter(Course.id == lesson.course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    if me.role == "teacher" and not _teacher_can_view_course(course, me.id, db):
        raise HTTPException(403, "Ce cours ne vous est pas assigné")

    # Supprimer le fichier physique si présent (pas de fichier pour les leçons YouTube)
    if lesson.file_path:
        path = os.path.join(UPLOAD_DIR, lesson.file_path)
        if os.path.exists(path):
            os.remove(path)

    db.delete(lesson)
    db.commit()


# ── Détail d'une leçon ────────────────────────────
@router.get("/{lesson_id}", response_model=LessonOut)
def get_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(404, "Leçon introuvable")

    _ensure_can_view_lesson(lesson, me, db)
    return lesson


# ── Servir le fichier (PDF ou vidéo) ─────────────
# Non applicable aux leçons YouTube (type="youtube") qui n'ont pas de fichier local.
@router.get("/{lesson_id}/file")
def serve_file(
    lesson_id: int,
    request:   Request,
    token:     str     = Query(None),
    db:        Session = Depends(get_db),
):
    # Auth : header Bearer ou query param ?token=
    auth_header = request.headers.get("Authorization", "")
    raw_token = token
    if not raw_token and auth_header.startswith("Bearer "):
        raw_token = auth_header.split(" ", 1)[1]
    if not raw_token:
        raise HTTPException(401, "Non authentifié")
    try:
        payload = verify_token(raw_token)
        user_id = int(payload.get("sub"))
    except Exception:
        raise HTTPException(401, "Token invalide")

    me = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not me:
        raise HTTPException(401, "Utilisateur introuvable ou inactif")

    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(404, "Leçon introuvable")

    # Les leçons YouTube n'ont pas de fichier local à servir
    if lesson.type == "youtube":
        raise HTTPException(400, "Cette leçon est hébergée sur YouTube, pas de fichier local")

    if not lesson.file_path:
        raise HTTPException(404, "Fichier introuvable")

    _ensure_can_view_lesson(lesson, me, db)

    path = os.path.join(UPLOAD_DIR, lesson.file_path)
    if not os.path.exists(path):
        raise HTTPException(404, "Fichier manquant sur le serveur")

    file_size = os.path.getsize(path)

    # PDF inline
    if lesson.type == "pdf":
        return FileResponse(
            path,
            media_type="application/pdf",
            headers={"Content-Disposition": "inline"},
        )

    # Vidéo avec streaming Range
    media_type = "video/mp4"
    ext = os.path.splitext(lesson.file_path)[1].lower()
    if ext == ".webm": media_type = "video/webm"
    elif ext == ".ogg": media_type = "video/ogg"

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
                    if not data: break
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
        headers={"Accept-Ranges": "bytes", "Content-Length": str(file_size)},
    )


# ── Progression ───────────────────────────────────
@router.post("/{lesson_id}/progress", response_model=ProgressOut)
def update_progress(
    lesson_id: int,
    body: ProgressIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    if me.role not in ("student", "admin"):
        raise HTTPException(403, "Seuls les étudiants ont une progression")

    prog = db.query(Progress).filter_by(user_id=me.id, lesson_id=lesson_id).first()
    if prog:
        prog.completed   = body.completed
        prog.last_page   = body.last_page
        prog.watched_sec = body.watched_sec
    else:
        prog = Progress(
            user_id=me.id, lesson_id=lesson_id,
            completed=body.completed,
            last_page=body.last_page,
            watched_sec=body.watched_sec,
        )
        db.add(prog)
    db.commit()
    db.refresh(prog)
    return prog


@router.get("/{lesson_id}/progress", response_model=ProgressOut | None)
def get_progress(
    lesson_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    return db.query(Progress).filter_by(user_id=me.id, lesson_id=lesson_id).first()
