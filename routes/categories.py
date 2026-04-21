from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List

from models import Category, get_db, User
from auth import get_current_user

router = APIRouter(prefix="/api/categories", tags=["categories"])

class CategoryOut(BaseModel):
    id: int; name: str; color: str; icon: str
    class Config: from_attributes = True

class CategoryIn(BaseModel):
    name: str; color: str = "#1E4DB7"; icon: str = "📚"

@router.get("", response_model=List[CategoryOut])
def list_categories(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Category).all()

@router.post("", response_model=CategoryOut, status_code=201)
def create_category(body: CategoryIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    cat = Category(**body.model_dump())
    db.add(cat); db.commit(); db.refresh(cat)
    return cat
