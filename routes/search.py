"""Recherche globale : cours, leçons, examens, devoirs, discussions du forum (et utilisateurs pour le personnel)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from auth import get_current_user
from models import (Course, Enrollment, Exam, ForumQuestion, Homework, Lesson, User, get_db)
from permissions import viewable_course_ids

router = APIRouter(prefix="/api/search", tags=["search"])


def _like(column, q: str):
    safe = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return column.ilike(f"%{safe}%", escape="\\")


def _snippet(text, q: str, size: int = 140) -> str:
    text = (text or "").strip().replace("\n", " ")
    if len(text) <= size:
        return text
    i = text.lower().find(q.lower())
    start = max(0, i - 40) if i >= 0 else 0
    return ("…" if start else "") + text[start:start + size] + "…"


@router.get("")
def search(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(8, ge=1, le=30),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    q = q.strip()
    visible = viewable_course_ids(db, me)       # None = tous les cours (administrateur)
    is_staff = me.role in ("admin", "teacher")

    def scoped(query, course_col):
        return query if visible is None else query.filter(course_col.in_(visible or [-1]))

    # ── Cours (les étudiants voient aussi le catalogue publié, pour pouvoir s'y inscrire)
    cq = db.query(Course).filter(or_(_like(Course.title, q), _like(Course.description, q)))
    if me.role == "student":
        cq = cq.filter(or_(Course.is_published == True, Course.id.in_(visible or [-1])))  # noqa: E712
    elif visible is not None:
        cq = cq.filter(Course.id.in_(visible or [-1]))
    courses = cq.order_by(Course.title).limit(limit).all()
    enrolled_ids = visible if me.role == "student" else set()

    course_titles = {}

    def title_of(cid):
        if cid not in course_titles:
            c = db.query(Course.title).filter(Course.id == cid).first()
            course_titles[cid] = c[0] if c else "Cours"
        return course_titles[cid]

    lessons = scoped(db.query(Lesson).filter(or_(_like(Lesson.title, q), _like(Lesson.description, q))),
                     Lesson.course_id).order_by(Lesson.title).limit(limit).all()

    exq = db.query(Exam).filter(or_(_like(Exam.title, q), _like(Exam.description, q)))
    hwq = db.query(Homework).filter(or_(_like(Homework.title, q), _like(Homework.description, q)))
    if not is_staff:
        exq = exq.filter(Exam.is_published == True)  # noqa: E712
        hwq = hwq.filter(Homework.is_published == True)  # noqa: E712
    exams = scoped(exq, Exam.course_id).order_by(Exam.title).limit(limit).all()
    homeworks = scoped(hwq, Homework.course_id).order_by(Homework.title).limit(limit).all()

    forum = scoped(db.query(ForumQuestion).filter(or_(_like(ForumQuestion.title, q), _like(ForumQuestion.body, q))),
                   ForumQuestion.course_id).order_by(ForumQuestion.created_at.desc()).limit(limit).all()

    users = []
    if is_staff:
        users = db.query(User).filter(or_(_like(User.name, q), _like(User.email, q), _like(User.matricule, q))
                                      ).order_by(User.name).limit(limit).all()

    results = {
        "courses": [{
            "id": c.id, "title": c.title, "snippet": _snippet(c.description, q),
            "category": c.category.name if c.category else None,
            "teacher": c.teacher.name if c.teacher else None,
            "published": c.is_published, "enrolled": c.id in enrolled_ids,
            "link": f"/courses/{c.id}",
        } for c in courses],
        "lessons": [{
            "id": l.id, "title": l.title, "snippet": _snippet(l.description, q),
            "course_id": l.course_id, "course": title_of(l.course_id), "link": f"/lesson/{l.id}",
        } for l in lessons],
        "exams": [{
            "id": e.id, "title": e.title, "snippet": _snippet(e.description, q),
            "course_id": e.course_id, "course": title_of(e.course_id), "link": "/exams",
        } for e in exams],
        "homeworks": [{
            "id": h.id, "title": h.title, "snippet": _snippet(h.description, q),
            "course_id": h.course_id, "course": title_of(h.course_id), "link": "/homeworks",
        } for h in homeworks],
        "forum": [{
            "id": f.id, "title": f.title, "snippet": _snippet(f.body, q),
            "course_id": f.course_id, "course": title_of(f.course_id), "link": f"/forum/{f.course_id}",
        } for f in forum],
        "users": [{
            "id": u.id, "title": u.name, "snippet": f"{u.email} · {u.role}", "link": "/admin" if me.role == "admin" else None,
        } for u in users],
    }
    results["total"] = sum(len(v) for v in results.values())
    results["q"] = q
    return results
