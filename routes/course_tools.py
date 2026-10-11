"""Copie d'un cours : duplique le contenu (leçons et fichiers, examens et questions, devoirs, miniature).

Les inscriptions, les copies d'étudiants, les notes et les messages du forum ne sont PAS copiés.
La copie est créée non publiée. Aucun fichier n'est téléchargé : tout se passe sur le serveur.
"""
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from models import Category, Course, Exam, ExamQuestion, Homework, Lesson, User, get_db
from permissions import ensure_course_access

router = APIRouter(prefix="/api/courses", tags=["course-tools"])

UPLOAD_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
FORMAT_VERSION = 1
ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".mp3", ".zip", ".txt",
               ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"}


# ───────────────────────── Export ─────────────────────────

def _abs_upload(rel: Optional[str]) -> Optional[str]:
    """Chemin absolu d'un fichier déjà téléversé, seulement s'il est bien dans le dossier uploads."""
    if not rel:
        return None
    rel = rel.replace("\\", "/").lstrip("/")
    if rel.startswith("uploads/"):
        rel = rel[len("uploads/"):]
    path = os.path.abspath(os.path.join(UPLOAD_ROOT, rel))
    if os.path.commonpath([path, UPLOAD_ROOT]) != UPLOAD_ROOT or not os.path.isfile(path):
        return None
    return path


def _iso(d):
    return d.isoformat() if d else None


def _export(course: Course):
    """Retourne (dictionnaire JSON, {nom interne: chemin du fichier})."""
    files = {}

    def add(abs_path):
        if not abs_path:
            return None
        arc = f"files/{len(files) + 1:04d}{os.path.splitext(abs_path)[1].lower()}"
        files[arc] = abs_path
        return arc

    data = {
        "format": "unilearn-course", "version": FORMAT_VERSION, "exported_at": datetime.utcnow().isoformat(),
        "course": {
            "title": course.title, "description": course.description,
            "category": course.category.name if course.category else None,
            "thumbnail_file": add(_abs_upload(course.thumbnail)),
        },
        "lessons": [{
            "title": l.title, "description": l.description, "type": l.type, "order": l.order,
            "youtube_url": l.youtube_url, "duration": l.duration, "file": add(_abs_upload(l.file_path)),
        } for l in sorted(course.lessons, key=lambda x: (x.order or 0, x.id))],
        "exams": [{
            "title": e.title, "description": e.description, "duration_min": e.duration_min,
            "starts_at": _iso(e.starts_at), "ends_at": _iso(e.ends_at), "shuffle_questions": e.shuffle_questions,
            "max_attempts": e.max_attempts, "passing_score": e.passing_score, "show_score_after": e.show_score_after,
            "questions": [{
                "order": q.order, "type": q.type, "text": q.text, "choices": q._choices, "answer": q.answer,
                "points": q.points, "explanation": q.explanation,
            } for q in sorted(e.questions, key=lambda x: (x.order or 0, x.id))],
        } for e in course.exams],
        "homeworks": [{
            "title": h.title, "description": h.description, "due_date": _iso(h.due_date), "max_score": h.max_score,
            "file": add(_abs_upload(h.file_path)),
        } for h in course.homeworks],
    }
    return data, files


# ───────────────────────── Import ─────────────────────────

def _dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _save(content: bytes, subdir: str, ext: str, prefix: str = "") -> str:
    ext = ext.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Type de fichier non autorisé dans la sauvegarde : {ext}")
    folder = os.path.join(UPLOAD_ROOT, subdir) if subdir else UPLOAD_ROOT
    os.makedirs(folder, exist_ok=True)
    name = f"{prefix}{uuid.uuid4().hex}{ext}"
    with open(os.path.join(folder, name), "wb") as fh:
        fh.write(content)
    return name


def _import(data: dict, get_file, db: Session, owner_id: int, title_suffix: str = "", keep_links_from: Optional[Course] = None) -> Course:
    c = data["course"]
    category_id = None
    if keep_links_from is not None:
        category_id = keep_links_from.category_id
    elif c.get("category"):
        cat = db.query(Category).filter(Category.name == c["category"]).first()
        category_id = cat.id if cat else None

    course = Course(
        title=((c.get("title") or "Cours")[: 200 - len(title_suffix)] + title_suffix),
        description=c.get("description"), teacher_id=owner_id, category_id=category_id,
        semester_id=keep_links_from.semester_id if keep_links_from else None,
        class_group_id=keep_links_from.class_group_id if keep_links_from else None,
        is_published=False,                      # une copie reste cachée tant qu'on ne l'a pas relue
    )
    db.add(course)
    db.flush()

    if c.get("thumbnail_file"):
        raw = get_file(c["thumbnail_file"])
        if raw:
            name = _save(raw, "thumbnails", os.path.splitext(c["thumbnail_file"])[1], prefix=f"thumb_{course.id}_")
            course.thumbnail = f"/uploads/thumbnails/{name}"

    for l in data.get("lessons", []):
        raw = get_file(l["file"]) if l.get("file") else None
        stored = _save(raw, "", os.path.splitext(l["file"])[1]) if raw else None
        db.add(Lesson(course_id=course.id, title=l.get("title") or "Leçon", description=l.get("description"),
                      type=l.get("type") or "pdf", file_path=stored, youtube_url=l.get("youtube_url"),
                      duration=l.get("duration"), order=l.get("order") or 0))

    for e in data.get("exams", []):
        exam = Exam(course_id=course.id, title=e.get("title") or "Examen", description=e.get("description"),
                    duration_min=e.get("duration_min"), starts_at=_dt(e.get("starts_at")), ends_at=_dt(e.get("ends_at")),
                    is_published=False, shuffle_questions=bool(e.get("shuffle_questions")),
                    max_attempts=e.get("max_attempts"), passing_score=e.get("passing_score"),
                    show_score_after=e.get("show_score_after") or "immediately")
        db.add(exam)
        db.flush()
        for q in e.get("questions", []):
            db.add(ExamQuestion(exam_id=exam.id, order=q.get("order") or 0, type=q.get("type") or "mcq", text=q.get("text") or "",
                                _choices=q.get("choices"), answer=q.get("answer"), points=q.get("points"),
                                explanation=q.get("explanation")))

    for h in data.get("homeworks", []):
        raw = get_file(h["file"]) if h.get("file") else None
        stored = None
        if raw:
            stored = f"uploads/homeworks/{_save(raw, 'homeworks', os.path.splitext(h['file'])[1])}"
        db.add(Homework(course_id=course.id, title=h.get("title") or "Devoir", description=h.get("description"),
                        due_date=_dt(h.get("due_date")) or datetime.utcnow() + timedelta(days=7), max_score=h.get("max_score"), is_published=False,
                        file_path=stored))
    db.commit()
    db.refresh(course)
    return course


def _get_course(db: Session, course_id: int) -> Course:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    return course


# ───────────────────────── Routes ─────────────────────────

@router.post("/{course_id}/duplicate", status_code=201)
def duplicate_course(course_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    """Copie le cours (contenu seulement, non publié). L'administrateur garde l'enseignant d'origine."""
    course = _get_course(db, course_id)
    ensure_course_access(course, me, db, manage=True)
    data, files = _export(course)

    def read(arc):
        path = files.get(arc)
        return open(path, "rb").read() if path else None

    owner = course.teacher_id if me.role == "admin" else me.id
    new = _import(data, read, db, owner, title_suffix=" (copie)", keep_links_from=course)
    return {"id": new.id, "title": new.title}
