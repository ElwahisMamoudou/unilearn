import os
import logging
from contextlib import asynccontextmanager
from uuid import uuid4
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

from models import (
    init_db, SessionLocal,
    User, Category, Course, Lesson, Enrollment, Message,
    get_db
)
from auth import hash_password, verify_password, get_current_user
from services.notifications import cleanup_connections

from routes import (
    auth          as auth_routes,
    courses       as course_routes,
    lessons       as lesson_routes,
    categories    as category_routes,
    messages      as message_routes,
    forum         as forum_routes,
    admin         as admin_routes,
    exams         as exam_routes,
    sessions      as session_routes,
    notifications as notif_routes,
    homeworks     as homework_routes,
    academic      as academic_routes,
    import_export as ie_routes,
    classes       as class_routes,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

 
def _build_cors_allowlist() -> list[str]:
    """
    Construit la liste sécurisée des origines CORS.
    ✅ Utilise une liste explicite (pas de regex wildcard)
    """
    allowed = set()
    
    # Environnement
    env = os.getenv("ENVIRONMENT", "development")
    
    # Origines de développement (local seulement)
    if env == "development":
        allowed.update({
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        })
    
    # Origines de production (EXPLICITES, pas de regex)
    cors_env = os.getenv("CORS_ORIGINS", "").strip()
    if cors_env:
        allowed.update(
            origin.strip()
            for origin in cors_env.split(",")
            if origin.strip()
        )
    
    if not allowed:
        # Fallback sûr si rien n'est configuré
        allowed.add("http://localhost:5173")
    
    return sorted(allowed)
 
 
CORS_ORIGINS = _build_cors_allowlist()
logger.info(f"CORS origins loaded: {CORS_ORIGINS}")
 
 
# Puis dans la configuration middleware:
app = FastAPI(
    title="UniLearn API",
    version="5.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    # ✅ JAMAIS allow_origin_regex en production!
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=3600,
)


def require_role(role: str):
    def checker(user: User = Depends(get_current_user)):
        if user.role != role:
            raise HTTPException(status_code=403, detail="Accès interdit")
        return user
    return checker


# ─────────────────────────────────────────────
# SEED
# ─────────────────────────────────────────────
def seed():
    """Initialise les données de base (exécuté une seule fois)."""
    db = SessionLocal()
    try:
        # Vérifier si seed est déjà fait
        if db.query(User).filter_by(email="admin@unilearn.cm").first():
            logger.info("✅ Seed déjà exécuté — données initiales présentes")
            return
 
        logger.info("🌱 Création des données initiales...")
 
        # Créer les catégories
        categories = [
            Category(name="Sciences", color="#0EA5E9"),
            Category(name="Maths", color="#F59E0B"),
            Category(name="Informatique", color="#EF4444"),
            Category(name="Maintenance", color="#10B981"),
            Category(name="Electronique", color="#8B5CF6"),
        ]
        
        for cat in categories:
            if not db.query(Category).filter_by(name=cat.name).first():
                db.add(cat)
        
        db.flush()
 
        # Créer les utilisateurs de base
        users_to_create = [
            User(
                name="Administrateur",
                email="admin@unilearn.cm",
                hashed_pwd=hash_password("admin1234"),
                role="admin",
                is_active=True,
            ),
            User(
                name="Prof. Aminou",
                email="prof@unilearn.cm",
                hashed_pwd=hash_password("prof1234"),
                role="teacher",
                is_active=True,
            ),
            User(
                name="Ahmadou Bello",
                email="etudiant@unilearn.cm",
                hashed_pwd=hash_password("etudiant1234"),
                role="student",
                is_active=True,
            ),
        ]
        
        for user in users_to_create:
            if not db.query(User).filter_by(email=user.email).first():
                db.add(user)
 
        db.commit()
        logger.info("✅ Seed terminé — données initiales créées")
        
    except Exception as e:
        db.rollback()
        logger.critical(f"❌ Erreur inattendue: {e}", exc_info=True)
    finally:
        db.close()


# ─────────────────────────────────────────────
# LIFESPAN
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    # ── Créer TOUS les dossiers d'upload au démarrage ──────────────
    # StaticFiles lève une erreur si le dossier n'existe pas.
    # uploads/recordings : enregistrements MediaRecorder (option 1)
    for folder in [
        "uploads",
        "uploads/thumbnails",
        "uploads/lessons",
        "uploads/homeworks",
        "uploads/submissions",
        "uploads/recordings",      # ← enregistrements sessions live
    ]:
        os.makedirs(folder, exist_ok=True)

    seed()
    yield


# ─────────────────────────────────────────────
# APP REDÉFINI AVEC LIFESPAN
# ─────────────────────────────────────────────
app = FastAPI(
    title="UniLearn API",
    version="5.0.0",
    lifespan=lifespan,
)

# ─────────────────────────────────────────────
# ROUTES API  ← TOUJOURS AVANT app.mount()
# ─────────────────────────────────────────────
from routes.youtube_oauth import router as youtube_oauth_router
from routes.webrtc import router as webrtc_router

app.include_router(auth_routes.router)
app.include_router(course_routes.router)
app.include_router(lesson_routes.router)
app.include_router(category_routes.router)
app.include_router(message_routes.router)
app.include_router(forum_routes.router)
app.include_router(admin_routes.router)
app.include_router(exam_routes.router)
app.include_router(session_routes.router)
app.include_router(notif_routes.router)
app.include_router(homework_routes.router)
app.include_router(academic_routes.router)
app.include_router(ie_routes.router)
app.include_router(class_routes.router)
app.include_router(youtube_oauth_router)
app.include_router(webrtc_router)


# ─────────────────────────────────────────────
# HEALTHCHECK
# ─────────────────────────────────────────────
@app.get("/api/health")
def api_health():
    return {"ok": True, "service": "unilearn-api"}

@app.get("/health")
def health():
    return {"ok": True, "service": "unilearn-api"}


# ─────────────────────────────────────────────
# DASHBOARD
# ─────────────────────────────────────────────
@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {
        "users":       db.query(User).count(),
        "courses":     db.query(Course).count(),
        "lessons":     db.query(Lesson).count(),
        "enrollments": db.query(Enrollment).count(),
    }


# ─────────────────────────────────────────────
# PROFIL
# ─────────────────────────────────────────────
class UserUpdateIn(BaseModel):
    name:  Optional[str]      = None
    email: Optional[EmailStr] = None

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password:     str

@app.patch("/api/users/me")
def update_profile(body: UserUpdateIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if body.name:
        me.name = body.name
    if body.email:
        exists = db.query(User).filter(User.email == body.email).first()
        if exists and exists.id != me.id:
            raise HTTPException(400, "Email déjà utilisé")
        me.email = body.email
    db.commit()
    return me

@app.post("/api/users/change-password")
def change_password(body: ChangePasswordIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if not verify_password(body.current_password, me.hashed_pwd):
        raise HTTPException(400, "Mot de passe incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 6 caractères")
    me.hashed_pwd = hash_password(body.new_password)
    db.commit()
    return {"message": "Mot de passe modifié"}


# ─────────────────────────────────────────────
# UPLOAD GÉNÉRIQUE
# ─────────────────────────────────────────────
UPLOAD_DIR         = os.getenv("UPLOAD_DIR", "uploads")
MAX_UPLOAD_BYTES   = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
ALLOWED_UPLOAD_EXT = {
    ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif",
    ".mp4", ".webm", ".zip", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
}

@app.post("/api/upload")
async def upload(file: UploadFile = File(...), me: User = Depends(get_current_user)):
    """Upload un fichier en streaming (pas de charge mémoire complète)."""
    _, ext = os.path.splitext(os.path.basename(file.filename or "file"))
    ext = ext.lower()
    
    # Vérifier l'extension
    if ext not in ALLOWED_UPLOAD_EXT:
        raise HTTPException(400, "Type de fichier non autorisé")
    
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    safe_name = f"{uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, safe_name)
    
    # Upload en chunks (pas en mémoire)
    bytes_written = 0
    chunk_size = 1024 * 1024  # 1 MB chunks
    
    try:
        with open(path, "wb") as f:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                
                bytes_written += len(chunk)
                if bytes_written > MAX_UPLOAD_BYTES:
                    os.remove(path)
                    raise HTTPException(
                        413,
                        f"Fichier > {MAX_UPLOAD_BYTES // 1024 // 1024}MB"
                    )
                
                f.write(chunk)
    
    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(path):
            os.remove(path)
        logger.error("file_upload_failed", error=str(e))
        raise HTTPException(500, "Erreur upload")
    
    logger.info("file_uploaded", user_id=me.id, filename=safe_name, size=bytes_written)
    return {"url": f"/uploads/{safe_name}"}


# ─────────────────────────────────────────────
# FICHIERS STATIQUES  ← TOUJOURS APRÈS les routes API
# ─────────────────────────────────────────────
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


# ─────────────────────────────────────────────
# GLOBAL ERROR HANDLER
# ─────────────────────────────────────────────
@app.exception_handler(Exception)
def global_exception(request, exc):
    logger.error(f"Erreur non gérée: {exc}")
    return JSONResponse(status_code=500, content={"message": "Erreur interne du serveur"})


# ─────────────────────────────────────────────
# ROOT
# ─────────────────────────────────────────────
@app.get("/")
def root():
    return {"message": "UniLearn API v5", "status": "running", "docs": "/docs"}


# ─────────────────────────────────────────────
# SHUTDOWN CLEANUP
# ─────────────────────────────────────────────
@app.on_event("shutdown")
async def shutdown_event():
    """Nettoie les connexions WebSocket au shutdown."""
    await cleanup_connections()