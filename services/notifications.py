"""
Services de notifications WebSocket et broadcast.
"""

import logging
from datetime import datetime
from typing import Dict, Set
from fastapi import WebSocket
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Stockage des connexions WebSocket actives par user_id
active_connections: Dict[int, Set[WebSocket]] = {}


async def add_connection(user_id: int, websocket: WebSocket):
    """Ajoute une connexion WebSocket pour un utilisateur."""
    if user_id not in active_connections:
        active_connections[user_id] = set()
    active_connections[user_id].add(websocket)
    logger.info(f"✅ WebSocket connected for user {user_id}")


async def remove_connection(user_id: int, websocket: WebSocket):
    """Retire une connexion WebSocket."""
    if user_id in active_connections:
        active_connections[user_id].discard(websocket)
        if not active_connections[user_id]:
            del active_connections[user_id]
    logger.info(f"❌ WebSocket disconnected for user {user_id}")


async def broadcast_to_user(user_id: int, message: dict):
    """Envoie un message à toutes les connexions WebSocket d'un utilisateur."""
    if user_id not in active_connections:
        return
    
    dead_connections = set()
    for websocket in active_connections[user_id]:
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"❌ Erreur envoi WebSocket user {user_id}: {e}")
            dead_connections.add(websocket)
    
    # Nettoie les connexions mortes
    for ws in dead_connections:
        await remove_connection(user_id, ws)


async def send_notification(
    db: Session,
    user_id: int,
    notif_type: str,
    title: str,
    body: str = None,
    link: str = None,
    priority: str = "normal"
):
    """
    Crée une notification ET l'envoie en temps réel via WebSocket.
    
    Args:
        db: Session SQLAlchemy
        user_id: ID utilisateur destinataire
        notif_type: Type (lesson_added, session_started, etc.)
        title: Titre court
        body: Contenu détaillé
        link: URL pour action directe
        priority: Priorité (low, normal, high, urgent)
    """
    from models import Notification
    
    # Crée en DB
    notif = Notification(
        user_id=user_id,
        type=notif_type,
        title=title,
        body=body,
        link=link,
        priority=priority,
        created_at=datetime.utcnow()
    )
    db.add(notif)
    db.commit()
    
    # Envoie en temps réel
    await broadcast_to_user(user_id, {
        "type": "notification",
        "id": notif.id,
        "notif_type": notif_type,
        "title": title,
        "body": body,
        "link": link,
        "priority": priority,
        "is_read": False,
        "created_at": notif.created_at.isoformat()
    })
    
    logger.info(f"✉️ Notification sent to user {user_id}: {title}")


async def notify_lesson_added(db: Session, course_id: int, lesson_title: str):
    """
    Helper : Notifie tous les étudiants inscrits qu'une leçon a été ajoutée.
    """
    from models import Enrollment
    
    # Récupère les inscriptions au cours
    enrollments = db.query(Enrollment).filter(Enrollment.course_id == course_id).all()
    
    for enrollment in enrollments:
        await send_notification(
            db=db,
            user_id=enrollment.student_id,
            notif_type="lesson_added",
            title=f"Nouvelle leçon : {lesson_title}",
            body=f"Une nouvelle leçon '{lesson_title}' a été ajoutée à votre cours.",
            link=f"/courses/{course_id}/lessons",
            priority="normal"
        )


async def notify_live_session_started(db: Session, course_id: int, course_title: str):
    """
    Helper : Notifie tous les étudiants inscrits qu'une session live a commencé.
    """
    from models import Enrollment
    
    enrollments = db.query(Enrollment).filter(Enrollment.course_id == course_id).all()
    
    for enrollment in enrollments:
        await send_notification(
            db=db,
            user_id=enrollment.student_id,
            notif_type="session_started",
            title=f"Live : {course_title}",
            body=f"Une session en direct a commencé dans '{course_title}'. Rejoignez-la maintenant !",
            link=f"/live/{course_id}",
            priority="high"
        )


async def notify_homework_assigned(db: Session, course_id: int, homework_title: str, student_id: int):
    """
    Helper : Notifie un étudiant qu'un devoir a été assigné.
    """
    await send_notification(
        db=db,
        user_id=student_id,
        notif_type="homework_assigned",
        title=f"Nouveau devoir : {homework_title}",
        body=f"Un devoir '{homework_title}' a été assigné à votre groupe.",
        link=f"/courses/{course_id}/homeworks",
        priority="normal"
    )


async def notify_homework_graded(db: Session, homework_title: str, grade: float, student_id: int):
    """
    Helper : Notifie un étudiant que son devoir a été noté.
    """
    await send_notification(
        db=db,
        user_id=student_id,
        notif_type="homework_graded",
        title=f"Devoir noté : {homework_title}",
        body=f"Votre devoir '{homework_title}' a été noté : {grade}/20",
        priority="normal"
    )


async def notify_exam_result(db: Session, exam_title: str, score: float, student_id: int):
    """
    Helper : Notifie un étudiant que ses résultats d'examen sont publiés.
    """
    await send_notification(
        db=db,
        user_id=student_id,
        notif_type="exam_result",
        title=f"Résultats : {exam_title}",
        body=f"Vos résultats pour '{exam_title}' sont maintenant disponibles : {score}/20",
        link=f"/exams/results",
        priority="normal"
    )


async def notify_message_received(db: Session, sender_name: str, student_id: int):
    """
    Helper : Notifie un étudiant qu'il a reçu un message.
    """
    await send_notification(
        db=db,
        user_id=student_id,
        notif_type="message_received",
        title=f"Nouveau message de {sender_name}",
        body=f"Vous avez un nouveau message de {sender_name}.",
        link=f"/messages",
        priority="normal"
    )


async def cleanup_connections():
    """Nettoie toutes les connexions WebSocket au shutdown."""
    for user_id in list(active_connections.keys()):
        for websocket in list(active_connections[user_id]):
            try:
                await websocket.close()
            except Exception as e:
                logger.error(f"Erreur fermeture WebSocket {user_id}: {e}")
    active_connections.clear()
    logger.info("✅ Toutes les connexions WebSocket fermées")
