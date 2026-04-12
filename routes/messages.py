from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from models import get_db, User, Message
from auth import get_current_user

router = APIRouter(prefix="/api/messages", tags=["messages"])


# ── Schémas ───────────────────────────────────────

class MessageIn(BaseModel):
    receiver_id: int
    subject:     str
    body:        str

class MessageOut(BaseModel):
    id:            int
    sender_id:     int
    receiver_id:   int
    sender_name:   str = ""
    receiver_name: str = ""
    subject:       str
    body:          str
    is_read:       bool
    created_at:    datetime
    class Config: from_attributes = True

class UserShortOut(BaseModel):
    id:   int
    name: str
    role: str
    class Config: from_attributes = True


def _fmt(m: Message) -> MessageOut:
    return MessageOut(
        id=m.id, sender_id=m.sender_id, receiver_id=m.receiver_id,
        sender_name  = m.sender.name   if m.sender   else "",
        receiver_name= m.receiver.name if m.receiver else "",
        subject=m.subject, body=m.body,
        is_read=m.is_read, created_at=m.created_at,
    )


# ── Inbox ─────────────────────────────────────────

@router.get("/inbox", response_model=List[MessageOut])
def get_inbox(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    msgs = (
        db.query(Message)
        .filter(Message.receiver_id == me.id)
        .order_by(Message.created_at.desc())
        .offset(skip).limit(limit)
        .all()
    )
    return [_fmt(m) for m in msgs]


# ── Envoyés ───────────────────────────────────────

@router.get("/sent", response_model=List[MessageOut])
def get_sent(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    msgs = (
        db.query(Message)
        .filter(Message.sender_id == me.id)
        .order_by(Message.created_at.desc())
        .offset(skip).limit(limit)
        .all()
    )
    return [_fmt(m) for m in msgs]


# ── Compteur non-lus ──────────────────────────────

@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    count = db.query(Message).filter(
        Message.receiver_id == me.id,
        Message.is_read == False,
    ).count()
    return {"count": count}


# ── Envoyer un message ────────────────────────────

@router.post("", response_model=MessageOut, status_code=201)
def send_message(
    body: MessageIn,
    db:   Session = Depends(get_db),
    me:   User    = Depends(get_current_user),
):
    receiver = db.query(User).filter(User.id == body.receiver_id, User.is_active == True).first()
    if not receiver:
        raise HTTPException(404, "Destinataire introuvable")
    if receiver.id == me.id:
        raise HTTPException(400, "Vous ne pouvez pas vous envoyer un message à vous-même")
    if not body.subject.strip():
        raise HTTPException(400, "L'objet ne peut pas être vide")
    if not body.body.strip():
        raise HTTPException(400, "Le corps du message ne peut pas être vide")

    msg = Message(
        sender_id=me.id, receiver_id=body.receiver_id,
        subject=body.subject.strip(), body=body.body.strip(),
    )
    db.add(msg); db.commit(); db.refresh(msg)
    return _fmt(msg)


# ── Marquer comme lu ──────────────────────────────

@router.put("/{msg_id}/read")
def mark_read(
    msg_id: int,
    db:     Session = Depends(get_db),
    me:     User    = Depends(get_current_user),
):
    msg = db.query(Message).filter(
        Message.id == msg_id, Message.receiver_id == me.id
    ).first()
    if not msg:
        raise HTTPException(404, "Message introuvable")
    msg.is_read = True
    db.commit()
    return {"ok": True}


# ── ✅ Marquer TOUS les messages comme lus ─────────

@router.put("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    db.query(Message).filter(
        Message.receiver_id == me.id,
        Message.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"ok": True}


# ── Supprimer un message ──────────────────────────

@router.delete("/{msg_id}", status_code=204)
def delete_message(
    msg_id: int,
    db:     Session = Depends(get_db),
    me:     User    = Depends(get_current_user),
):
    msg = db.query(Message).filter(
        Message.id == msg_id,
        (Message.sender_id == me.id) | (Message.receiver_id == me.id)
    ).first()
    if not msg:
        raise HTTPException(404, "Message introuvable")
    db.delete(msg); db.commit()


# ── Contacts disponibles ──────────────────────────

@router.get("/contacts", response_model=List[UserShortOut])
def get_contacts(
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    """Retourne tous les utilisateurs actifs sauf soi-même, triés par rôle puis nom."""
    users = (
        db.query(User)
        .filter(User.id != me.id, User.is_active == True)
        .order_by(User.role, User.name)
        .all()
    )
    return users
