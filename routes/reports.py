"""Rapports et journaux d'activité (administrateurs : tout le site ; enseignants : leurs cours)."""
import csv
import io
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from activity import ACTION_LABELS
from auth import get_current_user
from models import (ActivityLog, Course, CourseGroup, CourseGroupMember, Enrollment, Exam, ExamSubmission, Homework,
                    HomeworkSubmission, LoginHistory, Progress, User, get_db)
from permissions import ensure_course_access, viewable_course_ids

router = APIRouter(prefix="/api/reports", tags=["reports"])


def staff_only(me: User = Depends(get_current_user)) -> User:
    if me.role not in ("admin", "teacher"):
        raise HTTPException(403, "Accès réservé aux enseignants et administrateurs")
    return me


def admin_only(me: User = Depends(get_current_user)) -> User:
    if me.role != "admin":
        raise HTTPException(403, "Accès réservé aux administrateurs")
    return me


def _parse_day(value: Optional[str], end: bool = False) -> Optional[datetime]:
    if not value:
        return None
    try:
        d = datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Date invalide (format AAAA-MM-JJ)")
    return d + timedelta(days=1) if end else d


def _csv_response(rows, header, filename) -> StreamingResponse:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(header)
    w.writerows(rows)
    data = "\ufeff" + buf.getvalue()          # BOM : Excel lit correctement les accents
    return StreamingResponse(iter([data]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ───────────────────────── Journaux ─────────────────────────

def _logs_query(db, me, course_id, user_id, action, date_from, date_to):
    q = db.query(ActivityLog)
    scope = viewable_course_ids(db, me)
    if scope is not None:                      # enseignant : seulement ses cours
        q = q.filter(ActivityLog.course_id.in_(scope or [-1]))
    if course_id:
        q = q.filter(ActivityLog.course_id == course_id)
    if user_id:
        q = q.filter(ActivityLog.user_id == user_id)
    if action:
        q = q.filter(ActivityLog.action == action)
    d1, d2 = _parse_day(date_from), _parse_day(date_to, end=True)
    if d1:
        q = q.filter(ActivityLog.created_at >= d1)
    if d2:
        q = q.filter(ActivityLog.created_at < d2)
    return q.order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())


def _rows(db, logs):
    users = {u.id: u for u in db.query(User).filter(User.id.in_({l.user_id for l in logs if l.user_id}))}
    courses = {c.id: c.title for c in db.query(Course).filter(Course.id.in_({l.course_id for l in logs if l.course_id}))}
    return [{
        "id": l.id, "date": l.created_at.isoformat(), "action": l.action,
        "label": ACTION_LABELS.get(l.action, l.action),
        "user": {"id": l.user_id, "name": users[l.user_id].name, "role": users[l.user_id].role} if l.user_id in users else None,
        "course": {"id": l.course_id, "title": courses.get(l.course_id, "(cours supprimé)")} if l.course_id else None,
        "target_type": l.target_type, "target_id": l.target_id, "detail": l.detail, "ip": l.ip_address,
    } for l in logs]


@router.get("/actions")
def list_actions(me: User = Depends(staff_only)):
    return [{"value": k, "label": v} for k, v in ACTION_LABELS.items()]


@router.get("/courses")
def reportable_courses(db: Session = Depends(get_db), me: User = Depends(staff_only)):
    scope = viewable_course_ids(db, me)
    q = db.query(Course.id, Course.title).order_by(Course.title)
    if scope is not None:
        q = q.filter(Course.id.in_(scope or [-1]))
    return [{"id": i, "title": t} for i, t in q.all()]


@router.get("/logs")
def logs(course_id: Optional[int] = None, user_id: Optional[int] = None, action: Optional[str] = None,
         date_from: Optional[str] = None, date_to: Optional[str] = None,
         page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
         db: Session = Depends(get_db), me: User = Depends(staff_only)):
    q = _logs_query(db, me, course_id, user_id, action, date_from, date_to)
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return {"items": _rows(db, items), "total": total, "page": page, "page_size": page_size}


@router.get("/logs.csv")
def logs_csv(course_id: Optional[int] = None, user_id: Optional[int] = None, action: Optional[str] = None,
             date_from: Optional[str] = None, date_to: Optional[str] = None,
             db: Session = Depends(get_db), me: User = Depends(staff_only)):
    items = _logs_query(db, me, course_id, user_id, action, date_from, date_to).limit(20000).all()
    rows = [[r["date"].replace("T", " ")[:19], r["user"]["name"] if r["user"] else "", r["user"]["role"] if r["user"] else "",
             r["label"], r["course"]["title"] if r["course"] else "", r["ip"] or ""] for r in _rows(db, items)]
    return _csv_response(rows, ["Date (UTC)", "Utilisateur", "Rôle", "Action", "Cours", "Adresse IP"], "journal-activite.csv")


# ───────────────────────── Vue d'ensemble du site ─────────────────────────

@router.get("/overview")
def overview(db: Session = Depends(get_db), me: User = Depends(admin_only)):
    now = datetime.utcnow()
    d30, d14, d7 = now - timedelta(days=30), now - timedelta(days=14), now - timedelta(days=7)

    roles = dict(db.query(User.role, func.count(User.id)).filter(User.is_active == True).group_by(User.role).all())  # noqa: E712
    ok_logins = db.query(LoginHistory).filter(LoginHistory.success == True, LoginHistory.created_at >= d14).all()  # noqa: E712

    per_day = Counter(l.created_at.strftime("%Y-%m-%d") for l in ok_logins)
    days = [(d14 + timedelta(days=i + 1)).strftime("%Y-%m-%d") for i in range(14)]

    def active_since(since):
        return db.query(func.count(func.distinct(LoginHistory.user_id))).filter(
            LoginHistory.success == True, LoginHistory.created_at >= since).scalar() or 0  # noqa: E712

    by_action = Counter(a for (a,) in db.query(ActivityLog.action).filter(ActivityLog.created_at >= d30))
    top = (db.query(ActivityLog.course_id, func.count(ActivityLog.id))
             .filter(ActivityLog.created_at >= d30, ActivityLog.course_id.isnot(None))
             .group_by(ActivityLog.course_id).order_by(func.count(ActivityLog.id).desc()).limit(5).all())
    titles = {c.id: c.title for c in db.query(Course).filter(Course.id.in_([c for c, _ in top]))} if top else {}

    recent = db.query(LoginHistory).order_by(LoginHistory.created_at.desc()).limit(15).all()
    names = {u.id: u.name for u in db.query(User).filter(User.id.in_({l.user_id for l in recent}))} if recent else {}

    return {
        "users": {"student": roles.get("student", 0), "teacher": roles.get("teacher", 0), "admin": roles.get("admin", 0)},
        "courses": {"total": db.query(Course).count(), "published": db.query(Course).filter(Course.is_published == True).count()},  # noqa: E712
        "enrollments": db.query(Enrollment).count(),
        "active_users": {"last_7_days": active_since(d7), "last_30_days": active_since(d30)},
        "failed_logins_7_days": db.query(LoginHistory).filter(LoginHistory.success == False, LoginHistory.created_at >= d7).count(),  # noqa: E712
        "logins_per_day": [{"day": d, "count": per_day.get(d, 0)} for d in days],
        "activity_by_action": [{"action": a, "label": ACTION_LABELS.get(a, a), "count": n} for a, n in by_action.most_common()],
        "top_courses": [{"id": cid, "title": titles.get(cid, "(supprimé)"), "events": n} for cid, n in top],
        "recent_logins": [{"user": names.get(l.user_id, "?"), "success": bool(l.success), "ip": l.ip_address,
                           "date": l.created_at.isoformat()} for l in recent],
    }


# ───────────────────────── Rapport d'un cours ─────────────────────────

def _course_report(db: Session, course: Course, group_id: Optional[int]):
    students = [e.student for e in db.query(Enrollment).filter_by(course_id=course.id).all() if e.student]
    groups_of = defaultdict(list)
    for m in db.query(CourseGroupMember).join(CourseGroup, CourseGroup.id == CourseGroupMember.group_id
                                              ).filter(CourseGroup.course_id == course.id):
        groups_of[m.student_id].append(m.group.name)
    if group_id:
        in_group = {m.student_id for m in db.query(CourseGroupMember).filter_by(group_id=group_id)}
        students = [s for s in students if s.id in in_group]
    ids = [s.id for s in students]

    lesson_ids = [l.id for l in course.lessons]
    done = Counter()
    if lesson_ids and ids:
        for uid, n in db.query(Progress.user_id, func.count(Progress.id)).filter(
                Progress.lesson_id.in_(lesson_ids), Progress.completed == True,  # noqa: E712
                Progress.user_id.in_(ids)).group_by(Progress.user_id):
            done[uid] = n

    last = {}
    if ids:
        for uid, ts in db.query(ActivityLog.user_id, func.max(ActivityLog.created_at)).filter(
                ActivityLog.course_id == course.id, ActivityLog.user_id.in_(ids)).group_by(ActivityLog.user_id):
            last[uid] = ts

    exam_ids = [e.id for e in db.query(Exam.id).filter(Exam.course_id == course.id, Exam.is_published == True)]  # noqa: E712
    exam_pct, exam_n = defaultdict(list), defaultdict(set)
    if exam_ids and ids:
        for s in db.query(ExamSubmission).filter(ExamSubmission.exam_id.in_(exam_ids), ExamSubmission.student_id.in_(ids)):
            exam_n[s.student_id].add(s.exam_id)
            if s.graded and s.max_score:
                exam_pct[s.student_id].append(100.0 * (s.score or 0) / s.max_score)

    hws = {h.id: h for h in db.query(Homework).filter(Homework.course_id == course.id, Homework.is_published == True)}  # noqa: E712
    hw_pct, hw_n = defaultdict(list), defaultdict(set)
    if hws and ids:
        for s in db.query(HomeworkSubmission).filter(HomeworkSubmission.homework_id.in_(list(hws)), HomeworkSubmission.student_id.in_(ids)):
            hw_n[s.student_id].add(s.homework_id)
            mx = hws[s.homework_id].max_score
            if s.graded and mx and s.score is not None:
                hw_pct[s.student_id].append(100.0 * s.score / mx)

    avg = lambda xs: round(sum(xs) / len(xs), 1) if xs else None  # noqa: E731
    rows = []
    for s in sorted(students, key=lambda u: u.name.lower()):
        total = len(lesson_ids)
        rows.append({
            "id": s.id, "name": s.name, "email": s.email, "groups": sorted(groups_of.get(s.id, [])),
            "completed_lessons": done[s.id], "total_lessons": total,
            "progress_pct": round(100.0 * done[s.id] / total) if total else 0,
            "last_activity": last[s.id].isoformat() if s.id in last else None,
            "exams_taken": len(exam_n[s.id]), "exams_avg_pct": avg(exam_pct[s.id]),
            "homeworks_submitted": len(hw_n[s.id]), "homeworks_avg_pct": avg(hw_pct[s.id]),
        })
    return {
        "course": {"id": course.id, "title": course.title},
        "totals": {"students": len(rows), "lessons": len(lesson_ids), "exams": len(exam_ids), "homeworks": len(hws),
                   "avg_progress_pct": avg([r["progress_pct"] for r in rows]) or 0},
        "students": rows,
    }


def _course_for_report(db, me, course_id):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    ensure_course_access(course, me, db, manage=True)
    return course


@router.get("/course/{course_id}")
def course_report(course_id: int, group_id: Optional[int] = None, db: Session = Depends(get_db), me: User = Depends(staff_only)):
    return _course_report(db, _course_for_report(db, me, course_id), group_id)


@router.get("/course/{course_id}/export.csv")
def course_report_csv(course_id: int, group_id: Optional[int] = None, db: Session = Depends(get_db), me: User = Depends(staff_only)):
    rep = _course_report(db, _course_for_report(db, me, course_id), group_id)
    rows = [[r["name"], r["email"], ", ".join(r["groups"]), f'{r["completed_lessons"]}/{r["total_lessons"]}',
             r["progress_pct"], (r["last_activity"] or "").replace("T", " ")[:19], r["exams_taken"],
             "" if r["exams_avg_pct"] is None else r["exams_avg_pct"], r["homeworks_submitted"],
             "" if r["homeworks_avg_pct"] is None else r["homeworks_avg_pct"]] for r in rep["students"]]
    return _csv_response(rows, ["Nom", "E-mail", "Groupes", "Leçons terminées", "Progression %", "Dernière activité (UTC)",
                                "Examens passés", "Moyenne examens %", "Devoirs rendus", "Moyenne devoirs %"],
                         f"rapport-cours-{course_id}.csv")
