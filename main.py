import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from typing import Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from models import (
    init_db, SessionLocal,
    User, Category, Course, Lesson, Enrollment, Message,
    get_db
)
from auth import hash_password, verify_password, get_current_user

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
    db = SessionLocal()
    try:
        admin = db.query(User).filter_by(email="admin@unilearn.cm").first()
        if admin:
            logger.info("✅ Admin déjà présent — seed ignoré")
            return

        logger.info("🌱 Création des données initiales...")

        cats = [
            Category(name="Sciences",      color="#0EA5E9"),
            Category(name="Maths",         color="#F59E0B"),
            Category(name="Informatique",  color="#EF4444"),
            Category(name="Maintenance",   color="#10B981"),
            Category(name="Electronique",  color="#8B5CF6"),
        ]
        for c in cats:
            if not db.query(Category).filter_by(name=c.name).first():
                db.add(c)
        db.flush()

        db.add(User(
            name="Administrateur",
            email="admin@unilearn.cm",
            hashed_pwd=hash_password("admin1234"),
            role="admin",
            is_active=True,
        ))

        if not db.query(User).filter_by(email="prof@unilearn.cm").first():
            db.add(User(
                name="Prof. Aminou",
                email="prof@unilearn.cm",
                hashed_pwd=hash_password("prof1234"),
                role="teacher",
                is_active=True,
            ))

        if not db.query(User).filter_by(email="etudiant@unilearn.cm").first():
            db.add(User(
                name="Ahmadou Bello",
                email="etudiant@unilearn.cm",
                hashed_pwd=hash_password("etudiant1234"),
                role="student",
                is_active=True,
            ))

        db.commit()
        logger.info("✅ Seed terminé avec succès")
        logger.info("   admin@unilearn.cm    / admin1234")
        logger.info("   prof@unilearn.cm     / prof1234")
        logger.info("   etudiant@unilearn.cm / etudiant1234")

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Erreur seed: {e}")
    finally:
        db.close()


# ─────────────────────────────────────────────
# LIFESPAN
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    for folder in [
        "uploads",
        "uploads/thumbnails",
        "uploads/lessons",
        "uploads/homeworks",
        "uploads/submissions",
    ]:
        os.makedirs(folder, exist_ok=True)

    seed()
    yield


# ─────────────────────────────────────────────
# APP
# ─────────────────────────────────────────────
app = FastAPI(
    title="UniLearn API",
    version="5.0.0",
    lifespan=lifespan,
)

# ─────────────────────────────────────────────
# CORS
# allow_credentials=True est incompatible avec allow_origins=["*"].
# Solution : on utilise allow_origin_regex pour couvrir toutes les
# origines Vercel + localhost, sans lister chaque URL de preview.
# ─────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# ROUTES API  ← TOUJOURS AVANT app.mount()
# ─────────────────────────────────────────────
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


# ─────────────────────────────────────────────
# DASHBOARD
# ─────────────────────────────────────────────
@app.get("/api/dashboard")
def dashboard(
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
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
def update_profile(
    body: UserUpdateIn,
    db:   Session = Depends(get_db),
    me:   User    = Depends(get_current_user),
):
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
def change_password(
    body: ChangePasswordIn,
    db:   Session = Depends(get_db),
    me:   User    = Depends(get_current_user),
):
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
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    safe_name = os.path.basename(file.filename or "file")
    path = os.path.join(UPLOAD_DIR, safe_name)
    with open(path, "wb") as f:
        f.write(await file.read())
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
    return JSONResponse(
        status_code=500,
        content={"message": "Erreur interne du serveur"},
    )


# ─────────────────────────────────────────────
# ROOT
# ─────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "message": "UniLearn API v5",
        "status":  "running",
        "docs":    "/docs",
    }
