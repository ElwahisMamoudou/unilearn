from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from models import get_db, User, Course, Enrollment, ForumQuestion, ForumReply
from auth import get_current_user
from services.notifications import send_notification

router = APIRouter(prefix="/api/forum", tags=["forum"])


# ── Schémas ───────────────────────────────────────

class ReplyOut(BaseModel):
    id:          int
    question_id: int
    author_id:   int
    author_name: str = ""
    author_role: str = ""
    body:        str
    is_pinned:   bool = False
    created_at:  datetime
    class Config: from_attributes = True

class QuestionOut(BaseModel):
    id:          int
    course_id:   int
    author_id:   int
    author_name: str = ""
    author_role: str = ""
    title:       str
    body:        str
    is_closed:   bool = False
    created_at:  datetime
    reply_count: int = 0
    replies:     List[ReplyOut] = []
    class Config: from_attributes = True

class QuestionIn(BaseModel):
    title: str
    body:  str

class ReplyIn(BaseModel):
    body: str


# ── Helper accès cours ────────────────────────────

def _check_access(course_id: int, me: User, db: Session):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    if me.role == "admin":
        return course
    if me.role == "teacher" and course.teacher_id == me.id:
        return course
    enrolled = db.query(Enrollment).filter_by(student_id=me.id, course_id=course_id).first()
    if not enrolled:
        raise HTTPException(403, "Vous devez être inscrit à ce cours pour accéder au forum")
    return course


def _can_moderate(me: User, course: Course) -> bool:
    return me.role == "admin" or (me.role == "teacher" and course.teacher_id == me.id)


def _fmt_question(q: ForumQuestion, with_replies=False) -> QuestionOut:
    replies = []
    if with_replies:
        for r in sorted(q.replies, key=lambda x: (not x.is_pinned, x.created_at)):
            replies.append(ReplyOut(
                id=r.id, question_id=r.question_id,
                author_id=r.author_id,
                author_name=r.author.name if r.author else "",
                author_role=r.author.role if r.author else "",
                body=r.body, is_pinned=r.is_pinned,
                created_at=r.created_at,
            ))
    return QuestionOut(
        id=q.id, course_id=q.course_id,
        author_id=q.author_id,
        author_name=q.author.name if q.author else "",
        author_role=q.author.role if q.author else "",
        title=q.title, body=q.body,
        is_closed=q.is_closed, created_at=q.created_at,
        reply_count=len(q.replies), replies=replies,
    )


# ── Liste des questions ───────────────────────────

@router.get("/course/{course_id}", response_model=List[QuestionOut])
def list_questions(
    course_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    _check_access(course_id, me, db)
    questions = (
        db.query(ForumQuestion)
        .filter(ForumQuestion.course_id == course_id)
        .order_by(ForumQuestion.created_at.desc())
        .all()
    )
    return [_fmt_question(q) for q in questions]


# ── Détail question avec réponses ─────────────────

@router.get("/post/{question_id}", response_model=QuestionOut)
def get_question(
    question_id: int,
    db: Session  = Depends(get_db),
    me: User     = Depends(get_current_user),
):
    q = db.query(ForumQuestion).filter(ForumQuestion.id == question_id).first()
    if not q:
        raise HTTPException(404, "Question introuvable")
    _check_access(q.course_id, me, db)
    return _fmt_question(q, with_replies=True)


# ── Créer une question ────────────────────────────

@router.post("/course/{course_id}", response_model=QuestionOut, status_code=201)
async def create_question(
    course_id: int,
    body: QuestionIn,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    _check_access(course_id, me, db)
    if not body.title.strip():
        raise HTTPException(400, "Le titre ne peut pas être vide")
    if not body.body.strip():
        raise HTTPException(400, "Le corps ne peut pas être vide")
    q = ForumQuestion(
        course_id=course_id, author_id=me.id,
        title=body.title.strip(), body=body.body.strip(),
    )
    db.add(q); db.flush()

    # Notifier le prof du cours (sauf si c'est lui qui poste)
    course = db.query(Course).filter(Course.id == course_id).first()
    if course and course.teacher_id and course.teacher_id != me.id:
        await send_notification(
            db, course.teacher_id, "forum",
            f"Nouvelle question de {me.name}",
            body.title.strip()[:120],
            f"/forum?course={course_id}&question={q.id}",
        )

    db.commit(); db.refresh(q)
    return _fmt_question(q)


# ── Supprimer une question ────────────────────────

@router.delete("/post/{question_id}", status_code=204)
def delete_question(
    question_id: int,
    db: Session  = Depends(get_db),
    me: User     = Depends(get_current_user),
):
    q = db.query(ForumQuestion).filter(ForumQuestion.id == question_id).first()
    if not q:
        raise HTTPException(404, "Question introuvable")
    course = db.query(Course).filter(Course.id == q.course_id).first()
    if me.id != q.author_id and not _can_moderate(me, course):
        raise HTTPException(403, "Accès refusé")
    db.delete(q); db.commit()


# ── ✅ Fermer / rouvrir une question (enseignant/admin) ──

@router.put("/post/{question_id}/close")
def toggle_close_question(
    question_id: int,
    db: Session  = Depends(get_db),
    me: User     = Depends(get_current_user),
):
    q = db.query(ForumQuestion).filter(ForumQuestion.id == question_id).first()
    if not q:
        raise HTTPException(404, "Question introuvable")
    course = db.query(Course).filter(Course.id == q.course_id).first()
    if not _can_moderate(me, course):
        raise HTTPException(403, "Seul l'enseignant ou l'admin peut fermer une question")
    q.is_closed = not q.is_closed
    db.commit()
    return {"is_closed": q.is_closed}


# ── Répondre à une question ───────────────────────

@router.post("/post/{question_id}/reply", response_model=ReplyOut, status_code=201)
async def create_reply(
    question_id: int,
    body: ReplyIn,
    db: Session  = Depends(get_db),
    me: User     = Depends(get_current_user),
):
    q = db.query(ForumQuestion).filter(ForumQuestion.id == question_id).first()
    if not q:
        raise HTTPException(404, "Question introuvable")
    if q.is_closed:
        raise HTTPException(400, "Cette question est fermée — impossible de répondre")
    _check_access(q.course_id, me, db)
    if not body.body.strip():
        raise HTTPException(400, "La réponse ne peut pas être vide")
    reply = ForumReply(
        question_id=question_id, author_id=me.id,
        body=body.body.strip(),
    )
    db.add(reply); db.flush()

    # Notifier l'auteur de la question (sauf s'il répond à son propre post)
    if q.author_id != me.id:
        await send_notification(
            db, q.author_id, "forum",
            f"{me.name} a répondu à votre question",
            q.title[:120],
            f"/forum?course={q.course_id}&question={q.id}",
        )

    db.commit(); db.refresh(reply)
    return ReplyOut(
        id=reply.id, question_id=reply.question_id,
        author_id=reply.author_id, author_name=me.name,
        author_role=me.role, body=reply.body,
        is_pinned=reply.is_pinned, created_at=reply.created_at,
    )


# ── ✅ Épingler / désépingler une réponse (enseignant/admin) ──

@router.put("/reply/{reply_id}/pin")
def toggle_pin_reply(
    reply_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    reply = db.query(ForumReply).filter(ForumReply.id == reply_id).first()
    if not reply:
        raise HTTPException(404, "Réponse introuvable")
    q      = db.query(ForumQuestion).filter(ForumQuestion.id == reply.question_id).first()
    course = db.query(Course).filter(Course.id == q.course_id).first()
    if not _can_moderate(me, course):
        raise HTTPException(403, "Seul l'enseignant ou l'admin peut épingler une réponse")
    reply.is_pinned = not reply.is_pinned
    db.commit()
    return {"is_pinned": reply.is_pinned}


# ── Supprimer une réponse ─────────────────────────

@router.delete("/reply/{reply_id}", status_code=204)
def delete_reply(
    reply_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    reply = db.query(ForumReply).filter(ForumReply.id == reply_id).first()
    if not reply:
        raise HTTPException(404, "Réponse introuvable")
    q      = db.query(ForumQuestion).filter(ForumQuestion.id == reply.question_id).first()
    course = db.query(Course).filter(Course.id == q.course_id).first()
    if me.id != reply.author_id and not _can_moderate(me, course):
        raise HTTPException(403, "Accès refusé")
    db.delete(reply); db.commit()
