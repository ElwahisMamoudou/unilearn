import os, uuid, random
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Any, List, Optional
from datetime import datetime, timezone

from models import get_db, User, Course, Exam, ExamQuestion, ExamSubmission, ExamViolation
from auth import get_current_user

router = APIRouter(prefix="/api/exams", tags=["exams"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "exams")
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ══════════════════════════════════════════════════════
#  SCHÉMAS
# ══════════════════════════════════════════════════════

class QuestionIn(BaseModel):
    order:       int = 0
    type:        str          # mcq | truefalse | open | short | upload
    text:        str
    choices:     Optional[List[Any]] = None
    answer:      Optional[str] = None
    points:      float = 1.0
    explanation: Optional[str] = None

class QuestionOut(BaseModel):
    id: int; order: int; type: str; text: str
    choices: Optional[List[Any]]; answer: Optional[str]; points: float
    explanation: Optional[str] = None
    class Config: from_attributes = True

class ExamIn(BaseModel):
    course_id:         int
    title:             str
    description:       Optional[str] = None
    duration_min:      int = 60
    starts_at:         Optional[datetime] = None
    ends_at:           Optional[datetime] = None
    is_published:      bool = False
    questions:         List[QuestionIn] = []
    shuffle_questions: bool = False
    max_attempts:      int = 1
    passing_score:     Optional[float] = None
    show_score_after:  str = "immediately"

class ExamOut(BaseModel):
    id: int; course_id: int; title: str
    description: Optional[str]; duration_min: int
    starts_at: Optional[datetime]; ends_at: Optional[datetime]
    is_published: bool; created_at: datetime
    questions: List[QuestionOut] = []
    submission_count:  int = 0
    shuffle_questions: bool = False
    max_attempts:      int = 1
    passing_score:     Optional[float] = None
    show_score_after:  str = "immediately"
    class Config: from_attributes = True

class AnswerIn(BaseModel):
    answers:    dict
    violations: int = 0
    forced:     bool = False

class GradeIn(BaseModel):
    grades: dict

class QuestionResult(BaseModel):
    question_id:          int
    question_text:        str
    type:                 str
    correct:              Optional[bool] = None
    score_earned:         float
    points:               float
    student_answer:       Optional[str] = None
    student_answer_label: Optional[str] = None
    correct_answer_label: Optional[str] = None
    comment:              Optional[str] = None
    explanation:          Optional[str] = None

class SubmissionOut(BaseModel):
    id: int; exam_id: int; student_id: int
    student_name:     str = ""
    answers:          dict
    score:            Optional[float]
    max_score:        Optional[float]
    graded:           bool
    submitted_at:     datetime
    violations:       int = 0
    forced:           bool = False
    question_results: List[QuestionResult] = []
    attempts_used:    int = 1
    class Config: from_attributes = True

class ViolationIn(BaseModel):
    count: int = 1
    type:  str = "tab_switch"

class VisibilityIn(BaseModel):
    is_published: bool

class ScheduleIn(BaseModel):
    starts_at: Optional[datetime] = None
    ends_at:   Optional[datetime] = None


# ══════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════

def _fmt_date(dt) -> str:
    """Formate une date ou retourne 'date non définie' si None."""
    if dt is None:
        return "date non définie"
    return dt.strftime('%d/%m/%Y à %H:%M')


def _check_exam_owner(exam: Exam, me: User):
    if me.role == "admin":
        return
    if me.role == "teacher" and exam.course.teacher_id == me.id:
        return
    raise HTTPException(403, "Accès refusé")


def _is_accessible(exam: Exam) -> bool:
    if not exam.is_published:
        return False
    now = datetime.now(timezone.utc)
    if exam.starts_at:
        s = exam.starts_at if exam.starts_at.tzinfo else exam.starts_at.replace(tzinfo=timezone.utc)
        if now < s:
            return False
    if exam.ends_at:
        e = exam.ends_at if exam.ends_at.tzinfo else exam.ends_at.replace(tzinfo=timezone.utc)
        if now > e:
            return False
    return True


def _exam_status(exam: Exam) -> str:
    if not exam.is_published:
        return "draft"
    now = datetime.now(timezone.utc)
    if exam.starts_at:
        s = exam.starts_at if exam.starts_at.tzinfo else exam.starts_at.replace(tzinfo=timezone.utc)
        if now < s:
            return "scheduled"
    if exam.ends_at:
        e = exam.ends_at if exam.ends_at.tzinfo else exam.ends_at.replace(tzinfo=timezone.utc)
        if now > e:
            return "closed"
    return "open"


def _auto_grade(exam: Exam, answers: dict) -> tuple:
    score, max_s = 0.0, 0.0
    for q in exam.questions:
        max_s += q.points
        if q.type in ("mcq", "truefalse", "short") and q.answer is not None:
            given   = str(answers.get(str(q.id), "")).strip().lower()
            correct = str(q.answer).strip().lower()
            if given == correct:
                score += q.points
    return score, max_s


def _build_results(exam: Exam, sub: ExamSubmission) -> List[QuestionResult]:
    results = []
    answers       = sub.answers or {}
    grade_details = sub.grade_details or {}

    for q in sorted(exam.questions, key=lambda x: x.order):
        student_ans   = str(answers.get(str(q.id), "")).strip()
        detail        = grade_details.get(str(q.id), {})
        student_label = correct_label = None
        is_correct    = None
        score_earned  = 0.0
        choices       = q.choices  # propriété qui désérialise depuis Text

        if q.type == "mcq" and choices:
            try:
                idx = int(student_ans)
                student_label = choices[idx] if 0 <= idx < len(choices) else student_ans
            except (ValueError, TypeError):
                student_label = student_ans
            try:
                cidx = int(q.answer)
                correct_label = choices[cidx] if 0 <= cidx < len(choices) else q.answer
            except (ValueError, TypeError):
                correct_label = q.answer
            is_correct   = (student_ans.lower() == str(q.answer or "").lower())
            score_earned = q.points if is_correct else 0.0

        elif q.type == "truefalse":
            student_label = "Vrai" if student_ans == "true" else "Faux"
            correct_label = "Vrai" if str(q.answer) == "true" else "Faux"
            is_correct    = (student_ans.lower() == str(q.answer or "").lower())
            score_earned  = q.points if is_correct else 0.0

        elif q.type == "short":
            is_correct   = (student_ans.lower() == str(q.answer or "").lower())
            score_earned = q.points if is_correct else 0.0

        elif q.type in ("open", "upload"):
            score_earned = float(detail.get("score", 0) or 0)

        results.append(QuestionResult(
            question_id=q.id, question_text=q.text, type=q.type,
            correct=is_correct, score_earned=score_earned, points=q.points,
            student_answer=student_ans or None,
            student_answer_label=student_label,
            correct_answer_label=correct_label,
            comment=detail.get("comment"),
            explanation=q.explanation,
        ))
    return results


def _serialize_sub(sub: ExamSubmission, exam: Exam = None, db: Session = None) -> dict:
    results = []
    if sub.graded and exam:
        results = [r.dict() for r in _build_results(exam, sub)]

    attempts = 1
    if exam and db:
        attempts = db.query(ExamSubmission).filter_by(
            exam_id=exam.id, student_id=sub.student_id
        ).count()

    return {
        "id":               sub.id,
        "exam_id":          sub.exam_id,
        "student_id":       sub.student_id,
        "student_name":     sub.student.name if sub.student else "",
        "answers":          sub.answers,
        "score":            sub.score,
        "max_score":        sub.max_score,
        "graded":           sub.graded,
        "submitted_at":     sub.submitted_at,
        "violations":       sub.violations or 0,
        "forced":           sub.forced or False,
        "question_results": results,
        "attempts_used":    attempts,
    }


def _enrich_exam(exam: Exam) -> dict:
    questions = []
    for q in sorted(exam.questions, key=lambda x: x.order):
        questions.append({
            "id":          q.id,
            "order":       q.order,
            "type":        q.type,
            "text":        q.text,
            "choices":     q.choices,
            "answer":      q.answer,
            "points":      q.points,
            "explanation": q.explanation,
        })
    return {
        "id":                exam.id,
        "course_id":         exam.course_id,
        "title":             exam.title,
        "description":       exam.description,
        "duration_min":      exam.duration_min,
        "starts_at":         exam.starts_at,
        "ends_at":           exam.ends_at,
        "is_published":      exam.is_published,
        "created_at":        exam.created_at,
        "questions":         questions,
        "submission_count":  len(exam.submissions),
        "shuffle_questions": exam.shuffle_questions or False,
        "max_attempts":      exam.max_attempts or 1,
        "passing_score":     exam.passing_score,
        "show_score_after":  exam.show_score_after or "immediately",
    }


# ══════════════════════════════════════════════════════
#  CRUD EXAMENS
# ══════════════════════════════════════════════════════

@router.post("", status_code=201)
def create_exam(body: ExamIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if me.role not in ("admin", "teacher"):
        raise HTTPException(403, "Accès refusé")

    course = db.query(Course).filter(Course.id == body.course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    if me.role == "teacher" and course.teacher_id != me.id:
        raise HTTPException(403, "Ce cours ne vous appartient pas")

    exam = Exam(
        course_id         = body.course_id,
        title             = body.title,
        description       = body.description,
        duration_min      = body.duration_min,
        starts_at         = body.starts_at,
        ends_at           = body.ends_at,
        is_published      = body.is_published,
        shuffle_questions = body.shuffle_questions,
        max_attempts      = body.max_attempts,
        passing_score     = body.passing_score,
        show_score_after  = body.show_score_after,
    )
    db.add(exam)
    db.flush()

    for i, q in enumerate(body.questions):
        eq = ExamQuestion(
            exam_id     = exam.id,
            order       = q.order if q.order else i,
            type        = q.type,
            text        = q.text,
            answer      = q.answer,
            points      = q.points,
            explanation = q.explanation,
        )
        eq.choices = q.choices  # setter qui sérialise en JSON Text
        db.add(eq)

    db.commit()
    db.refresh(exam)
    return _enrich_exam(exam)


@router.get("/course/{course_id}")
def list_exams(course_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    exams = db.query(Exam).filter(Exam.course_id == course_id).all()
    result = []
    for e in exams:
        if me.role == "student" and not _is_accessible(e):
            continue
        result.append(_enrich_exam(e))
    return result


@router.get("/{exam_id}")
def get_exam(exam_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Examen introuvable")

    if me.role == "student":
        if not _is_accessible(exam):
            status = _exam_status(exam)
            if status == "scheduled":
                # ✅ FIX : _fmt_date protège contre starts_at None
                raise HTTPException(403, f"Examen pas encore ouvert — ouverture le {_fmt_date(exam.starts_at)} UTC")
            elif status == "closed":
                raise HTTPException(403, "La période de cet examen est terminée")
            else:
                raise HTTPException(403, "Examen non disponible")

        if exam.max_attempts > 0:
            used = db.query(ExamSubmission).filter_by(exam_id=exam_id, student_id=me.id).count()
            if used >= exam.max_attempts:
                raise HTTPException(403, f"Vous avez épuisé vos {exam.max_attempts} tentative(s)")

        data = _enrich_exam(exam)
        for q in data["questions"]:
            q["answer"] = None
        if exam.shuffle_questions:
            random.shuffle(data["questions"])
        return data

    return _enrich_exam(exam)


@router.put("/{exam_id}")
def update_exam(exam_id: int, body: ExamIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if me.role not in ("admin", "teacher"):
        raise HTTPException(403, "Accès refusé")
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Examen introuvable")
    _check_exam_owner(exam, me)

    exam.title             = body.title
    exam.description       = body.description
    exam.duration_min      = body.duration_min
    exam.starts_at         = body.starts_at
    exam.ends_at           = body.ends_at
    exam.is_published      = body.is_published
    exam.shuffle_questions = body.shuffle_questions
    exam.max_attempts      = body.max_attempts
    exam.passing_score     = body.passing_score
    exam.show_score_after  = body.show_score_after

    for q in exam.questions:
        db.delete(q)
    db.flush()

    for i, q in enumerate(body.questions):
        eq = ExamQuestion(
            exam_id=exam.id, order=q.order if q.order else i,
            type=q.type, text=q.text, answer=q.answer,
            points=q.points, explanation=q.explanation,
        )
        eq.choices = q.choices
        db.add(eq)

    db.commit()
    db.refresh(exam)
    return _enrich_exam(exam)


@router.delete("/{exam_id}", status_code=204)
def delete_exam(exam_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if me.role not in ("admin", "teacher"):
        raise HTTPException(403, "Accès refusé")
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Examen introuvable")
    _check_exam_owner(exam, me)
    db.delete(exam)
    db.commit()


# ══════════════════════════════════════════════════════
#  VISIBILITÉ & PROGRAMMATION
# ══════════════════════════════════════════════════════

@router.patch("/{exam_id}/visibility")
def set_visibility(exam_id: int, body: VisibilityIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if me.role not in ("admin", "teacher"):
        raise HTTPException(403, "Accès refusé")
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Examen introuvable")
    _check_exam_owner(exam, me)
    exam.is_published = body.is_published
    db.commit()
    db.refresh(exam)
    status = _exam_status(exam)
    # ✅ FIX : _fmt_date protège contre starts_at None
    messages = {
        "draft":     "Examen dépublié.",
        "scheduled": f"Publié — ouverture le {_fmt_date(exam.starts_at)} UTC.",
        "open":      "Examen publié et accessible maintenant.",
        "closed":    "Publié mais la période est terminée.",
    }
    return {"ok": True, "is_published": exam.is_published, "status": status, "message": messages.get(status, "")}


@router.patch("/{exam_id}/schedule")
def schedule_exam(exam_id: int, body: ScheduleIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if me.role not in ("admin", "teacher"):
        raise HTTPException(403, "Accès refusé")
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Examen introuvable")
    _check_exam_owner(exam, me)
    if body.starts_at and body.ends_at:
        s = body.starts_at if body.starts_at.tzinfo else body.starts_at.replace(tzinfo=timezone.utc)
        e = body.ends_at   if body.ends_at.tzinfo   else body.ends_at.replace(tzinfo=timezone.utc)
        if s >= e:
            raise HTTPException(400, "La date d'ouverture doit être antérieure à la fermeture")
    exam.starts_at = body.starts_at
    exam.ends_at   = body.ends_at
    db.commit()
    db.refresh(exam)
    return {"ok": True, "starts_at": exam.starts_at, "ends_at": exam.ends_at, "status": _exam_status(exam)}


# ══════════════════════════════════════════════════════
#  SOUMISSION
# ══════════════════════════════════════════════════════

@router.post("/{exam_id}/upload/{question_id}")
async def upload_answer_file(
    exam_id: int, question_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db), me: User = Depends(get_current_user),
):
    if me.role != "student":
        raise HTTPException(403, "Seuls les étudiants peuvent uploader")
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 10 Mo)")
    allowed = {".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed:
        raise HTTPException(400, f"Extension non autorisée : {', '.join(allowed)}")
    file_key = f"{exam_id}_{question_id}_{me.id}_{uuid.uuid4().hex[:8]}{ext}"
    with open(os.path.join(UPLOAD_DIR, file_key), "wb") as f:
        f.write(contents)
    return {"file_key": f"/uploads/exams/{file_key}"}


@router.post("/{exam_id}/submit")
def submit_exam(exam_id: int, body: AnswerIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if me.role != "student":
        raise HTTPException(403, "Seuls les étudiants peuvent soumettre")
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Examen introuvable")
    if not _is_accessible(exam):
        raise HTTPException(403, "Cet examen n'est pas accessible actuellement")

    used = db.query(ExamSubmission).filter_by(exam_id=exam_id, student_id=me.id).count()
    if exam.max_attempts > 0 and used >= exam.max_attempts:
        raise HTTPException(400, f"Vous avez épuisé vos {exam.max_attempts} tentative(s)")

    score, max_score = _auto_grade(exam, body.answers)
    has_manual = any(q.type in ("open", "upload") for q in exam.questions)

    sub = ExamSubmission(
        exam_id    = exam_id,
        student_id = me.id,
        score      = score,
        max_score  = max_score,
        graded     = not has_manual,
        violations = body.violations,
        forced     = body.forced,
    )
    sub.answers = body.answers
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return _serialize_sub(sub, exam, db)


@router.post("/{exam_id}/violation")
def log_violation(exam_id: int, body: ViolationIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    db.add(ExamViolation(exam_id=exam_id, student_id=me.id, violation_type=body.type, count=body.count))
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════
#  RÉSULTATS & CORRECTION
# ══════════════════════════════════════════════════════

@router.get("/{exam_id}/submissions")
def list_submissions(exam_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if me.role not in ("admin", "teacher"):
        raise HTTPException(403, "Accès refusé")
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Examen introuvable")
    subs = db.query(ExamSubmission).filter_by(exam_id=exam_id).all()
    return [_serialize_sub(s, exam, db) for s in subs]


@router.get("/{exam_id}/my-submission")
def my_submission(exam_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    sub  = db.query(ExamSubmission).filter_by(exam_id=exam_id, student_id=me.id).first()
    if not sub:
        raise HTTPException(404, "Aucune soumission")
    return _serialize_sub(sub, exam, db)


@router.post("/submissions/{sub_id}/grade")
def grade_submission(sub_id: int, body: GradeIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if me.role not in ("admin", "teacher"):
        raise HTTPException(403, "Accès refusé")
    sub = db.query(ExamSubmission).filter(ExamSubmission.id == sub_id).first()
    if not sub:
        raise HTTPException(404, "Soumission introuvable")
    exam = sub.exam

    current = sub.grade_details or {}
    current.update({str(k): v for k, v in body.grades.items()})
    sub.grade_details = current

    auto_score, max_score = _auto_grade(exam, sub.answers)
    manual_score = sum(
        float(current.get(str(q.id), {}).get("score", 0) or 0)
        for q in exam.questions if q.type in ("open", "upload")
    )
    sub.score     = auto_score + manual_score
    sub.max_score = max_score
    sub.graded    = True
    db.commit()
    db.refresh(sub)
    return _serialize_sub(sub, exam, db)
