from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from models import User, get_db

SECRET_KEY = "unilearn-super-secret-key-change-in-production"
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    """Valide un token JWT et retourne le payload. Lève HTTPException si invalide."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("sub") is None:
            raise HTTPException(status_code=401, detail="Token invalide")
        return payload
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invalide ou expiré",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exc
        uid = int(user_id)
    except (jwt.PyJWTError, ValueError, TypeError):
        raise credentials_exc

    user = db.query(User).filter(User.id == uid).first()
    if user is None or not user.is_active:
        raise credentials_exc
    return user


# ── Gardes de rôles ───────────────────────────────

def require_student(me: User = Depends(get_current_user)) -> User:
    """Seuls les étudiants peuvent accéder."""
    if me.role != "student":
        raise HTTPException(
            status_code=403,
            detail="Accès réservé aux étudiants"
        )
    return me


def require_teacher(me: User = Depends(get_current_user)) -> User:
    """Seuls les enseignants (et admins) peuvent accéder."""
    if me.role not in ("teacher", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Accès réservé aux enseignants"
        )
    return me


def require_admin(me: User = Depends(get_current_user)) -> User:
    """Seuls les admins peuvent accéder."""
    if me.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Accès réservé aux administrateurs"
        )
    return me


def require_student_or_admin(me: User = Depends(get_current_user)) -> User:
    """Étudiants et admins uniquement — pas les enseignants."""
    if me.role not in ("student", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Les enseignants ne peuvent pas s'inscrire à un cours"
        )
    return me