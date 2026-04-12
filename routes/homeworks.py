import os, uuid, shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from models import get_db, User, Course, Enrollment, Homework, HomeworkSubmission
from auth import get_current_user, require_teacher
from routes.notifications import create_notification, notify_course_students

router = APIRouter(prefix="/api/homeworks", tags=["homeworks"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "homeworks")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXT = {".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".zip", ".txt"}


# ── Schémas ───────────────────────────────────────
class HomeworkIn(BaseModel):
    course_id:   int
    title:       str
    description: Optional[str] = None
    due_date:    datetime
    max_score:   float = 20.0
    is_published: bool = False

class HomeworkOut(BaseModel):
    id: int; course_id: int; title: str
    description: Optional[str]; due_date: datetime
    max_score: float; is_published: bool; created_at: datetime
    submission_count: int = 0
    my_submission: Optional[dict] = None
    is_late: bool = False
    class Config: from_attributes = True

class SubOut(BaseModel):
    id: int; homework_id: int; student_id: int
    student_name: str = ""
    file_path: Optional[str]; comment: Optional[str]
    score: Optional[float]; feedback: Optional[str]
    graded: bool; submitted_at: datetime; late: bool
    class Config: from_attributes = True

class GradeIn(BaseModel):
    score: float
    feedback: Optional[str] = None


# ── Helper ────────────────────────────────────────
def _sub_dict(s: HomeworkSubmission) -> dict:
    return {
        "id":           s.id,
        "homework_id":  s.homework_id,
        "student_id":   s.student_id,
        "student_name": s.student.name if s.student else "",
        "file_path":    s.file_path,
        "comment":      s.comment,
        "score":        s.score,
        "feedback":     s.feedback,
        "graded":       s.graded,
        "submitted_at": s.submitted_at,
        "late":         s.late,
    }


# ── CRUD Devoirs ──────────────────────────────────
@router.post("", status_code=201)
def create_homework(
    body: HomeworkIn,
    db:   Session = Depends(get_db),
    me:   User    = Depends(require_teacher),
):
    course = db.query(Course).filter(Course.id == body.course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    if me.role == "teacher" and course.teacher_id != me.id:
        raise HTTPException(403, "Ce cours ne vous est pas assigné")

    hw = Homework(
        course_id=body.course_id, title=body.title,
        description=body.description, due_date=body.due_date,
        max_score=body.max_score, is_published=body.is_published,
    )
    db.add(hw); db.flush()

    if body.is_published:
        notify_course_students(
            db, body.course_id, "homework",
            f"Nouveau devoir : {body.title}",
            f"À rendre avant le {body.due_date.strftime('%d/%m/%Y à %H:%M')}",
            f"/homeworks?course={body.course_id}",
        )

    db.commit(); db.refresh(hw)
    hw.submission_count = 0
    return hw


@router.get("/course/{course_id}")
def list_homeworks(
    course_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")

    hws = db.query(Homework).filter(Homework.course_id == course_id).all()
    result = []
    now = datetime.now(timezone.utc)

    for hw in hws:
        if me.role == "student" and not hw.is_published:
            continue
        due = hw.due_date.replace(tzinfo=timezone.utc) if hw.due_date.tzinfo is None else hw.due_date
        my_sub = None
        if me.role == "student":
            sub = db.query(HomeworkSubmission).filter_by(
                homework_id=hw.id, student_id=me.id
            ).first()
            if sub:
                my_sub = _sub_dict(sub)
        result.append({
            "id":               hw.id,
            "course_id":        hw.course_id,
            "title":            hw.title,
            "description":      hw.description,
            "due_date":         hw.due_date,
            "max_score":        hw.max_score,
            "is_published":     hw.is_published,
            "created_at":       hw.created_at,
            "submission_count": len(hw.submissions),
            "my_submission":    my_sub,
            "is_late":          now > due,
        })
    return result


@router.put("/{hw_id}")
def update_homework(
    hw_id: int,
    body:  HomeworkIn,
    db:    Session = Depends(get_db),
    me:    User    = Depends(require_teacher),
):
    hw = db.query(Homework).filter(Homework.id == hw_id).first()
    if not hw:
        raise HTTPException(404, "Devoir introuvable")
    hw.title        = body.title
    hw.description  = body.description
    hw.due_date     = body.due_date
    hw.max_score    = body.max_score
    hw.is_published = body.is_published
    db.commit(); db.refresh(hw)
    return hw


@router.delete("/{hw_id}", status_code=204)
def delete_homework(
    hw_id: int,
    db:    Session = Depends(get_db),
    me:    User    = Depends(require_teacher),
):
    hw = db.query(Homework).filter(Homework.id == hw_id).first()
    if not hw:
        raise HTTPException(404, "Devoir introuvable")
    db.delete(hw); db.commit()


# ── Soumission de devoir ──────────────────────────
@router.post("/{hw_id}/submit")
async def submit_homework(
    hw_id:   int,
    comment: str         = Form(""),
    file:    UploadFile  = File(...),
    db:      Session     = Depends(get_db),
    me:      User        = Depends(get_current_user),
):
    if me.role != "student":
        raise HTTPException(403, "Seuls les étudiants peuvent soumettre")

    hw = db.query(Homework).filter(Homework.id == hw_id, Homework.is_published == True).first()
    if not hw:
        raise HTTPException(404, "Devoir introuvable")

    # Vérifier inscription
    enrolled = db.query(Enrollment).filter_by(
        student_id=me.id, course_id=hw.course_id
    ).first()
    if not enrolled:
        raise HTTPException(403, "Vous n'êtes pas inscrit à ce cours")

    # Vérifier extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Extension non autorisée. Acceptés : {', '.join(ALLOWED_EXT)}")

    # Vérifier taille
    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 20 Mo)")

    # Supprimer ancienne soumission si elle existe
    existing = db.query(HomeworkSubmission).filter_by(
        homework_id=hw_id, student_id=me.id
    ).first()
    if existing and existing.file_path:
        old_path = os.path.join(UPLOAD_DIR, existing.file_path)
        if os.path.exists(old_path):
            os.remove(old_path)
        db.delete(existing)
        db.flush()

    # Sauvegarder fichier
    filename = f"{hw_id}_{me.id}_{uuid.uuid4().hex[:8]}{ext}"
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
        f.write(contents)

    now = datetime.now(timezone.utc)
    due = hw.due_date.replace(tzinfo=timezone.utc) if hw.due_date.tzinfo is None else hw.due_date

    sub = HomeworkSubmission(
        homework_id=hw_id,
        student_id=me.id,
        file_path=filename,
        comment=comment or None,
        late=now > due,
    )
    db.add(sub); db.commit(); db.refresh(sub)
    return _sub_dict(sub)


# ── Liste des soumissions (enseignant/admin) ──────
@router.get("/{hw_id}/submissions")
def list_submissions(
    hw_id: int,
    db:    Session = Depends(get_db),
    me:    User    = Depends(get_current_user),
):
    if me.role not in ("admin", "teacher"):
        raise HTTPException(403, "Accès refusé")
    subs = db.query(HomeworkSubmission).filter_by(homework_id=hw_id).all()
    return [_sub_dict(s) for s in subs]


# ── Télécharger un fichier soumis ─────────────────
@router.get("/{hw_id}/submissions/{sub_id}/file")
def download_submission(
    hw_id:  int,
    sub_id: int,
    db:     Session = Depends(get_db),
    me:     User    = Depends(get_current_user),
):
    sub = db.query(HomeworkSubmission).filter_by(id=sub_id, homework_id=hw_id).first()
    if not sub:
        raise HTTPException(404, "Soumission introuvable")
    if me.role == "student" and sub.student_id != me.id:
        raise HTTPException(403, "Accès refusé")

    path = os.path.join(UPLOAD_DIR, sub.file_path)
    if not os.path.exists(path):
        raise HTTPException(404, "Fichier introuvable")
    return FileResponse(path, filename=sub.file_path)


# ── Noter un devoir ───────────────────────────────
@router.put("/{hw_id}/submissions/{sub_id}/grade")
def grade_submission(
    hw_id:  int,
    sub_id: int,
    body:   GradeIn,
    db:     Session = Depends(get_db),
    me:     User    = Depends(get_current_user),
):
    if me.role not in ("admin", "teacher"):
        raise HTTPException(403, "Accès refusé")
    sub = db.query(HomeworkSubmission).filter_by(id=sub_id, homework_id=hw_id).first()
    if not sub:
        raise HTTPException(404, "Soumission introuvable")

    sub.score    = body.score
    sub.feedback = body.feedback
    sub.graded   = True
    db.commit()

    # Notifier l'étudiant
    create_notification(
        db, sub.student_id, "correction",
        f"Votre devoir a été corrigé",
        f"Note : {body.score}/{sub.homework.max_score}",
        f"/homeworks?course={sub.homework.course_id}",
    )
    db.commit()
    db.refresh(sub)
    return _sub_dict(sub)
