"""
activity.py — journal d'activité (utilisé par les rapports).

Un « middleware » (voir main.py) enregistre automatiquement les actions importantes
(consulter un cours, rendre un devoir, passer un examen, copier un cours...) sans qu'il
faille modifier chaque route. Les erreurs de journalisation ne cassent jamais la requête.
"""
import logging
import re
from datetime import datetime, timedelta
from typing import Optional

import jwt

from auth import ALGORITHM, SECRET_KEY
from models import ActivityLog, Exam, ForumQuestion, Homework, Lesson, SessionLocal

logger = logging.getLogger("unilearn.activity")

ACTION_LABELS = {
    "course_view":      "Consultation d'un cours",
    "course_enroll":    "Inscription à un cours",
    "course_create":    "Création d'un cours",
    "course_delete":    "Suppression d'un cours",
    "course_duplicate": "Copie d'un cours",
    "course_backup":    "Sauvegarde d'un cours",
    "course_restore":   "Restauration d'un cours",
    "lesson_progress":  "Lecture d'une leçon",
    "exam_submit":      "Examen rendu",
    "homework_submit":  "Devoir rendu",
    "forum_post":       "Question publiée au forum",
    "forum_reply":      "Réponse publiée au forum",
    "group_create":     "Création d'un groupe",
    "password_change":  "Changement de mot de passe",
    "password_reset":   "Mot de passe réinitialisé",
    "admin_password_reset": "Mot de passe réinitialisé par un administrateur",
}

# (méthode, motif d'URL, action, type de cible, minutes sans doublon)
RULES = [
    ("GET",    r"^/api/courses/(\d+)$",              "course_view",      "course",   10),
    ("POST",   r"^/api/courses/(\d+)/enroll$",       "course_enroll",    "course",   0),
    ("POST",   r"^/api/lessons/(\d+)/progress$",     "lesson_progress",  "lesson",   10),
    ("POST",   r"^/api/exams/(\d+)/submit$",         "exam_submit",      "exam",     0),
    ("POST",   r"^/api/homeworks/(\d+)/submit$",     "homework_submit",  "homework", 0),
    ("POST",   r"^/api/forum/course/(\d+)$",         "forum_post",       "course",   0),
    ("POST",   r"^/api/forum/post/(\d+)/reply$",     "forum_reply",      "forum",    0),
    ("POST",   r"^/api/courses/(\d+)/duplicate$",    "course_duplicate", "course",   0),
    ("GET",    r"^/api/courses/(\d+)/backup$",       "course_backup",    "course",   0),
    ("POST",   r"^/api/courses/restore$",            "course_restore",   None,       0),
    ("POST",   r"^/api/courses/(\d+)/groups(/auto)?$", "group_create",     "course",   0),
    ("POST",   r"^/api/admin/courses$",              "course_create",    None,       0),
    ("DELETE", r"^/api/admin/courses/(\d+)$",        "course_delete",    "course",   0),
    ("POST",   r"^/api/users/change-password$",      "password_change",  None,       0),
    ("POST",   r"^/api/admin/users/(\d+)/reset-password$", "admin_password_reset", "user", 0),
]
_COMPILED = [(m, re.compile(p), a, t, d) for m, p, a, t, d in RULES]


def _course_of(db, target_type: Optional[str], target_id: Optional[int]) -> Optional[int]:
    if not target_id:
        return None
    model = {"lesson": Lesson, "exam": Exam, "homework": Homework, "forum": ForumQuestion}.get(target_type)
    if target_type == "course":
        return target_id
    if model is None:
        return None
    row = db.query(model.course_id).filter(model.id == target_id).first()
    return row[0] if row else None


def log_activity(db, user_id, action, course_id=None, target_type=None, target_id=None,
                 detail=None, ip=None, dedupe_minutes=0):
    """Enregistre une action. Ne lève jamais d'exception."""
    try:
        if dedupe_minutes and user_id:
            since = datetime.utcnow() - timedelta(minutes=dedupe_minutes)
            exists = db.query(ActivityLog.id).filter(
                ActivityLog.user_id == user_id, ActivityLog.action == action,
                ActivityLog.target_id == target_id, ActivityLog.created_at >= since,
            ).first()
            if exists:
                return
        db.add(ActivityLog(
            user_id=user_id, action=action, course_id=course_id, target_type=target_type,
            target_id=target_id, detail=(detail or None) and detail[:300], ip_address=ip,
        ))
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.warning("journal d'activité ignoré : %s", exc)


def record_request(method: str, path: str, status: int, auth_header: str, ip: Optional[str]) -> None:
    """Appelé par le middleware après chaque requête (dans un thread)."""
    if status >= 400 or not auth_header.lower().startswith("bearer "):
        return
    for m, rx, action, ttype, dedupe in _COMPILED:
        if m != method:
            continue
        match = rx.match(path)
        if not match:
            continue
        try:
            payload = jwt.decode(auth_header[7:], SECRET_KEY, algorithms=[ALGORITHM])
            user_id = int(payload["sub"])
        except Exception:  # noqa: BLE001
            return
        target_id = int(match.group(1)) if match.groups() else None
        db = SessionLocal()
        try:
            course_id = _course_of(db, ttype, target_id)
            log_activity(db, user_id, action, course_id, ttype, target_id, ip=ip, dedupe_minutes=dedupe)
        finally:
            db.close()
        return
