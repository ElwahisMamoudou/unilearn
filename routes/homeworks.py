import os, uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone

from models import get_db, User, Course, ClassGroup, Enrollment, Homework, HomeworkSubmission
from auth import get_current_user, require_teacher
from services.notifications import send_notification

router = APIRouter(prefix="/api/homeworks", tags=["homeworks"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "homeworks")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXT = {".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".zip", ".txt",
               ".xls", ".xlsx", ".ppt", ".pptx", ".rar", ".7z", ".gif", ".webp", ".csv"}
MAX_SIZE_MB = 50

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
        raise HTTPException(403, "Ce cours ne vous est pas assigné")
    if manage:
        raise HTTPException(403, "Accès réservé aux enseignants")
    enrolled = db.query(Enrollment.id).filter_by(student_id=me.id, course_id=course.id).first()
    if not enrolled:
        raise HTTPException(403, "Vous n'êtes pas inscrit à ce cours")


def _ensure_homework_access(hw: Homework, me: User, db: Session, manage: bool = False) -> Course:
    course = db.query(Course).filter(Course.id == hw.course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    _ensure_course_access(course, me, db, manage=manage)
    return course


# ── Schémas ───────────────────────────────────────
class GradeIn(BaseModel):
    score:    float
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


async def _save_file(file: UploadFile, subfolder: str = "homeworks") -> str:
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(
            400,
            f"Extension non autorisée : '{ext}'. "
            f"Acceptées : {', '.join(sorted(ALLOWED_EXT))}"
        )

    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > MAX_SIZE_MB:
        raise HTTPException(400, f"Fichier trop volumineux ({size_mb:.1f} Mo). Maximum : {MAX_SIZE_MB} Mo")

    dest_dir = os.path.join(os.path.dirname(__file__), "..", "uploads", subfolder)
    os.makedirs(dest_dir, exist_ok=True)

    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = os.path.join(dest_dir, safe_name)
    with open(dest_path, "wb") as f_out:
        f_out.write(contents)

    return f"uploads/{subfolder}/{safe_name}"


# ── CRÉATION d'un devoir ──────────────────────────
@router.post("", status_code=201)
async def create_homework(
    course_id:    int           = Form(...),
    title:        str           = Form(...),
    description:  Optional[str] = Form(None),
    due_date:     str           = Form(...),
    max_score:    float         = Form(20.0),
    is_published: bool          = Form(False),
    file: Optional[UploadFile]  = File(None),
    db:   Session               = Depends(get_db),
    me:   User                  = Depends(require_teacher),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    _ensure_course_access(course, me, db, manage=True)

    try:
        due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, "Format de date invalide. Attendu : ISO 8601 (ex: 2025-06-15T23:59:00)")

    file_path = None
    if file and file.filename:
        file_path = await _save_file(file, subfolder="homeworks")

    hw = Homework(
        course_id    = course_id,
        title        = title.strip(),
        description  = description,
        due_date     = due_dt,
        max_score    = max_score,
        is_published = is_published,
        file_path    = file_path,
    )
    db.add(hw)
    db.flush()

    if is_published:
        await send_notification(
            db, course_id, "homework",
            f"Nouveau devoir : {title}",
            f"À rendre avant le {due_dt.strftime('%d/%m/%Y à %H:%M')}",
            f"/homeworks?course={course_id}",
        )

    db.commit()
    db.refresh(hw)
    hw.submission_count = 0
    return hw


# ── Télécharger le fichier joint d'un devoir ──────
@router.get("/{hw_id}/file")
def download_homework_file(
    hw_id: int,
    db:    Session = Depends(get_db),
    me:    User    = Depends(get_current_user),
):
    hw = db.query(Homework).filter(Homework.id == hw_id).first()
    if not hw:
        raise HTTPException(404, "Devoir introuvable")
    _ensure_homework_access(hw, me, db)

    if me.role == "student" and not hw.is_published:
        raise HTTPException(403, "Devoir non publié")

    if not hw.file_path:
        raise HTTPException(404, "Aucun fichier joint à ce devoir")

    abs_path = os.path.join(os.path.dirname(__file__), "..", hw.file_path)
    abs_path = os.path.normpath(abs_path)

    if not os.path.exists(abs_path):
        raise HTTPException(404, "Fichier introuvable sur le serveur")

    return FileResponse(
        path       = abs_path,
        filename   = os.path.basename(abs_path),
        media_type = "application/octet-stream",
    )


# ── Liste des devoirs d'un cours ──────────────────
@router.get("/course/{course_id}")
def list_homeworks(
    course_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")

    _ensure_course_access(course, me, db)

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
            "file_path":        hw.file_path,
            "has_file":         bool(hw.file_path),
            "submission_count": len(hw.submissions),
            "my_submission":    my_sub,
            "is_late":          now > due,
        })
    return result


# ── Mise à jour d'un devoir ───────────────────────
@router.put("/{hw_id}")
async def update_homework(
    hw_id:        int,
    course_id:    int           = Form(...),
    title:        str           = Form(...),
    description:  Optional[str] = Form(None),
    due_date:     str           = Form(...),
    max_score:    float         = Form(20.0),
    is_published: bool          = Form(False),
    file: Optional[UploadFile]  = File(None),
    db:   Session               = Depends(get_db),
    me:   User                  = Depends(require_teacher),
):
    hw = db.query(Homework).filter(Homework.id == hw_id).first()
    if not hw:
        raise HTTPException(404, "Devoir introuvable")

    _ensure_homework_access(hw, me, db, manage=True)
    new_course = db.query(Course).filter(Course.id == course_id).first()
    if not new_course:
        raise HTTPException(404, "Cours introuvable")
    _ensure_course_access(new_course, me, db, manage=True)

    try:
        due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, "Format de date invalide")

    if file and file.filename:
        if hw.file_path:
            old = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", hw.file_path))
            if os.path.exists(old):
                os.remove(old)
        hw.file_path = await _save_file(file, subfolder="homeworks")

    hw.course_id    = course_id
    hw.title        = title.strip()
    hw.description  = description
    hw.due_date     = due_dt
    hw.max_score    = max_score
    hw.is_published = is_published
    db.commit()
    db.refresh(hw)
    return hw


# ── Suppression ───────────────────────────────────
@router.delete("/{hw_id}", status_code=204)
def delete_homework(
    hw_id: int,
    db:    Session = Depends(get_db),
    me:    User    = Depends(require_teacher),
):
    hw = db.query(Homework).filter(Homework.id == hw_id).first()
    if not hw:
        raise HTTPException(404, "Devoir introuvable")

    _ensure_homework_access(hw, me, db, manage=True)

    if hw.file_path:
        abs_path = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", hw.file_path))
        if os.path.exists(abs_path):
            os.remove(abs_path)

    db.delete(hw)
    db.commit()


# ── Soumission de devoir par un étudiant ──────────
@router.post("/{hw_id}/submit")
async def submit_homework(
    hw_id:   int,
    comment: str        = Form(""),
    file:    UploadFile = File(...),
    db:      Session    = Depends(get_db),
    me:      User       = Depends(get_current_user),
):
    if me.role != "student":
        raise HTTPException(403, "Seuls les étudiants peuvent soumettre")

    hw = db.query(Homework).filter(Homework.id == hw_id, Homework.is_published == True).first()
    if not hw:
        raise HTTPException(404, "Devoir introuvable ou non publié")

    enrolled = db.query(Enrollment).filter_by(student_id=me.id, course_id=hw.course_id).first()
    if not enrolled:
        raise HTTPException(403, "Vous n'êtes pas inscrit à ce cours")

    existing = db.query(HomeworkSubmission).filter_by(
        homework_id=hw_id, student_id=me.id
    ).first()
    if existing:
        if existing.file_path:
            old = os.path.normpath(
                os.path.join(os.path.dirname(__file__), "..", "uploads", "submissions", existing.file_path)
            )
            if os.path.exists(old):
                os.remove(old)
        db.delete(existing)
        db.flush()

    rel_path = await _save_file(file, subfolder="submissions")
    now = datetime.now(timezone.utc)
    due = hw.due_date.replace(tzinfo=timezone.utc) if hw.due_date.tzinfo is None else hw.due_date

    sub = HomeworkSubmission(
        homework_id = hw_id,
        student_id  = me.id,
        file_path   = os.path.basename(rel_path),
        comment     = comment or None,
        late        = now > due,
    )
    db.add(sub); db.flush()

    # Notifier le prof du cours
    course = db.query(Course).filter(Course.id == hw.course_id).first()
    if course and course.teacher_id:
        await send_notification(
            db, course.teacher_id, "submission",
            f"Nouvelle soumission : {hw.title}",
            f"{me.name} a rendu son devoir" + (" (en retard)" if sub.late else ""),
            f"/homeworks?course={hw.course_id}",
        )

    db.commit()
    db.refresh(sub)
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

    hw = db.query(Homework).filter(Homework.id == hw_id).first()
    if not hw:
        raise HTTPException(404, "Devoir introuvable")
    _ensure_homework_access(hw, me, db, manage=True)
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
    hw = db.query(Homework).filter(Homework.id == hw_id).first()
    if not hw:
        raise HTTPException(404, "Devoir introuvable")
    if me.role == "student" and sub.student_id != me.id:
        raise HTTPException(403, "Accès refusé")
    if me.role in ("admin", "teacher"):
        _ensure_homework_access(hw, me, db, manage=True)

    path = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "uploads", "submissions", sub.file_path))
    if not os.path.exists(path):
        raise HTTPException(404, "Fichier introuvable")
    return FileResponse(path, filename=sub.file_path)


# ── Notation ──────────────────────────────────────
@router.put("/{hw_id}/submissions/{sub_id}/grade")
async def grade_submission(
    hw_id:  int,
    sub_id: int,
    body:   GradeIn,
    db:     Session = Depends(get_db),
    me:     User    = Depends(get_current_user),
):
    if me.role not in ("admin", "teacher"):
        raise HTTPException(403, "Accès refusé")
    hw = db.query(Homework).filter(Homework.id == hw_id).first()
    if not hw:
        raise HTTPException(404, "Devoir introuvable")
    _ensure_homework_access(hw, me, db, manage=True)
    sub = db.query(HomeworkSubmission).filter_by(id=sub_id, homework_id=hw_id).first()
    if not sub:
        raise HTTPException(404, "Soumission introuvable")

    sub.score    = body.score
    sub.feedback = body.feedback
    sub.graded   = True
    db.commit()

    await send_notification(
        db, sub.student_id, "correction",
        "Votre devoir a été corrigé",
        f"Note : {body.score}/{sub.homework.max_score}",
        f"/homeworks?course={sub.homework.course_id}",
    )
    db.commit()
    db.refresh(sub)
    return _sub_dict(sub)
