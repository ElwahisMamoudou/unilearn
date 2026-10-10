"""Mot de passe oublié : demande par e-mail, puis choix d'un nouveau mot de passe via un lien à usage unique."""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from activity import log_activity
from auth import hash_password
from email_service import (EMAIL_ENABLED, FRONTEND_URL, create_reset_token, hash_token,
                           send_password_reset_link)
from models import PasswordResetToken, User, get_db
from routes.auth import limiter

logger = logging.getLogger("unilearn.password")
router = APIRouter(prefix="/api/auth", tags=["auth"])

MIN_PASSWORD_LEN = 8
GENERIC_MESSAGE = "Si cette adresse correspond à un compte, un e-mail vient d'être envoyé."


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password")
@limiter.limit("5/hour")
def forgot_password(request: Request, body: ForgotIn, db: Session = Depends(get_db)):
    """Répond toujours la même chose (même si l'adresse n'existe pas) pour ne pas révéler les comptes."""
    user = db.query(User).filter_by(email=body.email.lower().strip()).first()
    if user and user.is_active:
        token = create_reset_token(db, user, hours=1)
        link = f"{FRONTEND_URL}/reset-password?token={token}"
        if not send_password_reset_link(user.email, user.name, link) and not EMAIL_ENABLED:
            logger.warning("E-mail non configuré (SMTP_USER / SMTP_PASSWORD) : impossible d'envoyer le lien de réinitialisation.")
    return {"message": GENERIC_MESSAGE}


@router.get("/reset-password/check")
def check_reset_token(token: str, db: Session = Depends(get_db)):
    """Permet à la page de dire tout de suite si le lien est encore valable."""
    row = db.query(PasswordResetToken).filter(
        PasswordResetToken.token.in_([hash_token(token), token])).first()
    ok = bool(row and not row.used and row.expires_at >= datetime.utcnow())
    return {"valid": ok}


@router.post("/reset-password")
@limiter.limit("10/hour")
def reset_password(request: Request, body: ResetIn, db: Session = Depends(get_db)):
    if len(body.new_password) < MIN_PASSWORD_LEN:
        raise HTTPException(400, f"Le mot de passe doit contenir au moins {MIN_PASSWORD_LEN} caractères")
    row = db.query(PasswordResetToken).filter(
        PasswordResetToken.token.in_([hash_token(body.token), body.token])).first()
    if not row or row.used or row.expires_at < datetime.utcnow():
        raise HTTPException(400, "Lien invalide ou expiré. Refaites une demande.")
    user = db.query(User).filter(User.id == row.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(400, "Lien invalide ou expiré. Refaites une demande.")
    user.hashed_pwd = hash_password(body.new_password)
    row.used = True
    db.commit()
    log_activity(db, user.id, "password_reset", ip=request.client.host if request.client else None)
    return {"message": "Mot de passe modifié. Vous pouvez vous connecter."}
