from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from models import get_db, User, Notification, Enrollment, Exam, Homework
from auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# ── Schémas ───────────────────────────────────────
class NotifOut(BaseModel):
    id: int; type: str; title: str
    body: Optional[str]; link: Optional[str]
    is_read: bool; created_at: datetime
    class Config: from_attributes = True


# ── Helper : créer une notification ───────────────
def create_notification(db: Session, user_id: int, type: str, title: str, body: str = None, link: str = None):
    notif = Notification(
        user_id=user_id, type=type,
        title=title, body=body, link=link
    )
    db.add(notif)


def notify_course_students(db: Session, course_id: int, type: str, title: str, body: str = None, link: str = None):
    """Notifie tous les étudiants inscrits à un cours."""
    enrollments = db.query(Enrollment).filter_by(course_id=course_id).all()
    for e in enrollments:
        create_notification(db, e.student_id, type, title, body, link)


# ── Endpoints ─────────────────────────────────────
@router.get("", response_model=List[NotifOut])
def get_notifications(
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    return (
        db.query(Notification)
        .filter_by(user_id=me.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    count = db.query(Notification).filter_by(user_id=me.id, is_read=False).count()
    return {"count": count}


@router.patch("/{notif_id}/read")
def mark_read(
    notif_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    notif = db.query(Notification).filter_by(id=notif_id, user_id=me.id).first()
    if not notif:
        raise HTTPException(404, "Notification introuvable")
    notif.is_read = True
    db.commit()
    return {"ok": True}


@router.patch("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    db.query(Notification).filter_by(user_id=me.id, is_read=False).update({"is_read": True})
    db.commit()
    return {"ok": True}


@router.delete("/{notif_id}", status_code=204)
def delete_notification(
    notif_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    notif = db.query(Notification).filter_by(id=notif_id, user_id=me.id).first()
    if not notif:
        raise HTTPException(404, "Notification introuvable")
    db.delete(notif)
    db.commit()


# ── Rappels automatiques (appelé par un cron ou au démarrage) ──
@router.post("/send-reminders", tags=["admin"])
def send_exam_reminders(
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    """Envoie des rappels pour les examens qui ferment dans moins de 24h."""
    if me.role != "admin":
        raise HTTPException(403, "Accès refusé")

    from datetime import timezone, timedelta
    now = datetime.now(timezone.utc)
    in_24h = now + timedelta(hours=24)

    exams = db.query(Exam).filter(
        Exam.is_published == True,
        Exam.ends_at != None,
    ).all()

    sent = 0
    for exam in exams:
        ends = exam.ends_at.replace(tzinfo=timezone.utc) if exam.ends_at.tzinfo is None else exam.ends_at
        if now < ends <= in_24h:
            enrollments = db.query(Enrollment).filter_by(course_id=exam.course_id).all()
            for e in enrollments:
                create_notification(
                    db, e.student_id,
                    type="reminder",
                    title=f"Rappel : examen '{exam.title}' ferme bientôt",
                    body=f"Clôture le {ends.strftime('%d/%m/%Y à %H:%M')} UTC",
                    link=f"/exams?course={exam.course_id}",
                )
                sent += 1
    db.commit()
    return {"reminders_sent": sent}
