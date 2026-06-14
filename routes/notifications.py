from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from models import get_db, User, Notification, Enrollment, Exam
from auth import get_current_user
from services.notifications import add_connection, remove_connection, broadcast_to_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# ── Schémas ───────────────────────────────────────
class NotifOut(BaseModel):
    id: int
    type: str
    title: str
    body: Optional[str]
    link: Optional[str]
    is_read: bool
    priority: Optional[str] = "normal"
    created_at: datetime
    
    class Config:
        from_attributes = True


# ── WebSocket Temps Réel ─────────────────────────
@router.websocket("/ws")
async def websocket_notifications(websocket: WebSocket):
    """
    WebSocket temps réel pour notifications.
    Authentification via token dans le URL : ws://localhost:8000/api/notifications/ws?token=<JWT_TOKEN>
    """
    try:
        await websocket.accept()
        
        # Récupère le token du query param
        query_params = websocket.scope.get("query_string", b"").decode()
        token = None
        for param in query_params.split("&"):
            if param.startswith("token="):
                token = param.split("=", 1)[1]
                break
        
        if not token:
            await websocket.close(code=4001, reason="Token requis")
            return
        
        # Vérifie le token et récupère l'utilisateur
        try:
            from auth import verify_token
            payload = verify_token(token)
            user_id = payload.get("sub")
            if not user_id:
                await websocket.close(code=4001, reason="Token invalide")
                return
        except Exception as e:
            await websocket.close(code=4001, reason=f"Erreur auth: {str(e)}")
            return
        
        # Enregistre la connexion
        await add_connection(user_id, websocket)
        
        # Boucle d'attente de messages
        try:
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
        
        except WebSocketDisconnect:
            await remove_connection(user_id, websocket)
    
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except:
            pass


# ── Endpoints REST (Fallback Polling) ──────────────
@router.get("", response_model=List[NotifOut])
def get_notifications(
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Récupère les dernières 50 notifications (fallback si WS down)."""
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
    me: User = Depends(get_current_user),
):
    """Nombre de notifications non lues."""
    count = db.query(Notification).filter_by(user_id=me.id, is_read=False).count()
    return {"count": count}


@router.patch("/{notif_id}/read")
def mark_read(
    notif_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Marque une notification comme lue."""
    notif = db.query(Notification).filter_by(id=notif_id, user_id=me.id).first()
    if not notif:
        raise HTTPException(404, "Notification introuvable")
    notif.is_read = True
    db.commit()
    return {"ok": True}


@router.patch("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Marque toutes les notifications comme lues."""
    db.query(Notification).filter_by(user_id=me.id, is_read=False).update({"is_read": True})
    db.commit()
    return {"ok": True}


@router.delete("/{notif_id}", status_code=204)
def delete_notification(
    notif_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Supprime une notification."""
    notif = db.query(Notification).filter_by(id=notif_id, user_id=me.id).first()
    if not notif:
        raise HTTPException(404, "Notification introuvable")
    db.delete(notif)
    db.commit()


# ── Rappels automatiques ──
@router.post("/send-reminders", tags=["admin"])
def send_exam_reminders(
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
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
                notif = Notification(
                    user_id=e.student_id,
                    type="reminder",
                    title=f"Rappel : examen '{exam.title}' ferme bientôt",
                    body=f"Clôture le {ends.strftime('%d/%m/%Y à %H:%M')} UTC",
                    link=f"/exams?course={exam.course_id}",
                    priority="high"
                )
                db.add(notif)
                sent += 1
    
    db.commit()
    return {"reminders_sent": sent}
