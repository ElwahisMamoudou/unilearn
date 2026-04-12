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

# Chargement .env
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Imports internes
from models import (
    init_db, SessionLocal,
    User, Category, Course, Lesson, Enrollment, Message,
    get_db
)
from auth import (
    hash_password, verify_password,
    get_current_user
)

# ROUTES
from routes import (
    auth         as auth_routes,
    courses      as course_routes,
    lessons      as lesson_routes,
    categories   as category_routes,
    messages     as message_routes,
    forum        as forum_routes,
    admin        as admin_routes,
    exams        as exam_routes,
    sessions     as session_routes,
    notifications as notif_routes,
    homeworks    as homework_routes,
    academic     as academic_routes,
    import_export as ie_routes,
    classes      as class_routes,      # ✅ importé ici avec les autres
)

# ─────────────────────────────────────────────
# LOGGER
# ─────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# ROLES / PERMISSIONS
# ─────────────────────────────────────────────
def require_role(role: str):
    def checker(user: User = Depends(get_current_user)):
        if user.role != role:
            raise HTTPException(status_code=403, detail="Accès interdit")
        return user
    return checker

# ─────────────────────────────────────────────
# SEED DATA
# ─────────────────────────────────────────────
def seed():
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return

        logger.info("Initialisation des données...")

        cats = [
            Category(name="Sciences", color="#0EA5E9"),
            Category(name="Maths",    color="#F59E0B"),
            Category(name="Info",     color="#EF4444"),
        ]
        db.add_all(cats)
        db.flush()

        admin = User(
            name       = "Admin",
            email      = "admin@unilearn.cm",
            hashed_pwd = hash_password("admin1234"),
            role       = "admin"
        )
        db.add(admin)
        db.commit()

        logger.info("Seed terminé")

    except Exception as e:
        db.rollback()
        logger.error(f"Erreur seed: {e}")
    finally:
        db.close()

# ─────────────────────────────────────────────
# LIFESPAN
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed()
    yield

# ─────────────────────────────────────────────
# APP
# ─────────────────────────────────────────────
app = FastAPI(
    title    = "UniLearn API",
    version  = "5.0.0",
    lifespan = lifespan
)

# ─────────────────────────────────────────────
# CORS
# ─────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ─────────────────────────────────────────────
# ROUTES
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
app.include_router(class_routes.router)   # ✅ inclus une seule fois ici

# ─────────────────────────────────────────────
# DASHBOARD
# ─────────────────────────────────────────────
@app.get("/api/dashboard")
def dashboard(
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user)
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
    name:  Optional[str]
    email: Optional[EmailStr]

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password:     str

@app.patch("/api/users/me")
def update_profile(
    body: UserUpdateIn,
    db:   Session = Depends(get_db),
    me:   User    = Depends(get_current_user)
):
    if body.name:
        me.name = body.name
    if body.email:
        exists = db.query(User).filter(User.email == body.email).first()
        if exists:
            raise HTTPException(400, "Email déjà utilisé")
        me.email = body.email
    db.commit()
    return me

@app.post("/api/users/change-password")
def change_password(
    body: ChangePasswordIn,
    db:   Session = Depends(get_db),
    me:   User    = Depends(get_current_user)
):
    if not verify_password(body.current_password, me.hashed_pwd):
        raise HTTPException(400, "Mot de passe incorrect")
    me.hashed_pwd = hash_password(body.new_password)
    db.commit()
    return {"message": "Mot de passe modifié"}

# ─────────────────────────────────────────────
# UPLOAD
# ─────────────────────────────────────────────
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    path = os.path.join(UPLOAD_DIR, file.filename)
    with open(path, "wb") as f:
        f.write(await file.read())
    return {"url": f"/uploads/{file.filename}"}

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ─────────────────────────────────────────────
# GLOBAL ERROR HANDLER
# ─────────────────────────────────────────────
@app.exception_handler(Exception)
def global_exception(request, exc):
    logger.error(str(exc))
    return JSONResponse(
        status_code=500,
        content={"message": "Erreur interne"}
    )

# ─────────────────────────────────────────────
# ROOT
# ─────────────────────────────────────────────
@app.get("/")
def root():
    return {"message": "UniLearn API v5 🚀"}