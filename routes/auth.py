from slowapi import Limiter
from slowapi.util import get_remote_address
import time
 
limiter = Limiter(key_func=get_remote_address)
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from models import get_db, User, LoginHistory
from auth import (
    verify_password, create_access_token,
    get_current_user, hash_password
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    name:     str
    email:    str
    password: str
    role:     str = "student"

class TokenOut(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user: dict

class UserOut(BaseModel):
    id: int; name: str; email: str; role: str
    avatar_url: Optional[str]
    class Config: from_attributes = True

@router.post("/login", response_model=TokenOut)
@limiter.limit("5/minute")  # Max 5 tentatives par minute par IP
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Authentification avec protections:
    - Rate limiting: 5 tentatives/minute
    - Délai anti-timing attack
    """
    user = db.query(User).filter_by(email=form.username.lower().strip()).first()
    success = user and verify_password(form.password, user.hashed_pwd) and user.is_active
 
    # Enregistrer l'historique
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "")[:300]
    
    if user:
        db.add(LoginHistory(
            user_id=user.id,
            ip_address=ip,
            user_agent=user_agent,
            success=success,
        ))
        db.commit()
 
    if not success:
        # Délai pour ralentir les brute force
        time.sleep(1)
        raise HTTPException(401, "Email ou mot de passe incorrect")
 
    token = create_access_token({"sub": str(user.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
        },
    }


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/login-history")
def my_login_history(
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    """Historique des connexions de l'utilisateur connecté."""
    logs = (
        db.query(LoginHistory)
        .filter_by(user_id=me.id)
        .order_by(LoginHistory.created_at.desc())
        .limit(20)
        .all()
    )
    return [{
        "ip":         l.ip_address,
        "user_agent": l.user_agent,
        "success":    l.success,
        "date":       l.created_at,
    } for l in logs]
