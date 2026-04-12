from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from models import get_db, User, AcademicYear, Semester
from auth import get_current_user, require_admin

router = APIRouter(prefix="/api/academic", tags=["academic"])


# ── Schémas ───────────────────────────────────────
class SemesterIn(BaseModel):
    name:       str
    start_date: datetime
    end_date:   datetime
    is_current: bool = False

class SemesterOut(BaseModel):
    id: int; name: str
    start_date: datetime; end_date: datetime
    is_current: bool
    class Config: from_attributes = True

class YearIn(BaseModel):
    name:       str          # ex: "2024-2025"
    start_date: datetime
    end_date:   datetime
    is_current: bool = False
    semesters:  List[SemesterIn] = []

class YearOut(BaseModel):
    id: int; name: str
    start_date: datetime; end_date: datetime
    is_current: bool; created_at: datetime
    semesters: List[SemesterOut] = []
    class Config: from_attributes = True


# ── Années académiques ────────────────────────────
@router.get("/years", response_model=List[YearOut])
def list_years(
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    return db.query(AcademicYear).order_by(AcademicYear.start_date.desc()).all()


@router.get("/years/current", response_model=YearOut)
def current_year(
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    year = db.query(AcademicYear).filter_by(is_current=True).first()
    if not year:
        raise HTTPException(404, "Aucune année académique courante définie")
    return year


@router.post("/years", response_model=YearOut, status_code=201)
def create_year(
    body: YearIn,
    db:   Session = Depends(get_db),
    me:   User    = Depends(require_admin),
):
    if body.is_current:
        db.query(AcademicYear).update({"is_current": False})

    year = AcademicYear(
        name=body.name, start_date=body.start_date,
        end_date=body.end_date, is_current=body.is_current,
    )
    db.add(year); db.flush()

    for s in body.semesters:
        if s.is_current:
            db.query(Semester).update({"is_current": False})
        db.add(Semester(
            academic_year_id=year.id, name=s.name,
            start_date=s.start_date, end_date=s.end_date,
            is_current=s.is_current,
        ))

    db.commit(); db.refresh(year)
    return year


@router.put("/years/{year_id}", response_model=YearOut)
def update_year(
    year_id: int,
    body:    YearIn,
    db:      Session = Depends(get_db),
    me:      User    = Depends(require_admin),
):
    year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
    if not year:
        raise HTTPException(404, "Année introuvable")

    if body.is_current:
        db.query(AcademicYear).filter(AcademicYear.id != year_id).update({"is_current": False})

    year.name       = body.name
    year.start_date = body.start_date
    year.end_date   = body.end_date
    year.is_current = body.is_current
    db.commit(); db.refresh(year)
    return year


@router.delete("/years/{year_id}", status_code=204)
def delete_year(
    year_id: int,
    db:      Session = Depends(get_db),
    me:      User    = Depends(require_admin),
):
    year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
    if not year:
        raise HTTPException(404, "Année introuvable")
    db.delete(year); db.commit()


# ── Semestres ─────────────────────────────────────
@router.post("/years/{year_id}/semesters", response_model=SemesterOut, status_code=201)
def add_semester(
    year_id: int,
    body:    SemesterIn,
    db:      Session = Depends(get_db),
    me:      User    = Depends(require_admin),
):
    year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
    if not year:
        raise HTTPException(404, "Année introuvable")

    if body.is_current:
        db.query(Semester).update({"is_current": False})

    sem = Semester(
        academic_year_id=year_id, name=body.name,
        start_date=body.start_date, end_date=body.end_date,
        is_current=body.is_current,
    )
    db.add(sem); db.commit(); db.refresh(sem)
    return sem


@router.put("/semesters/{sem_id}", response_model=SemesterOut)
def update_semester(
    sem_id: int,
    body:   SemesterIn,
    db:     Session = Depends(get_db),
    me:     User    = Depends(require_admin),
):
    sem = db.query(Semester).filter(Semester.id == sem_id).first()
    if not sem:
        raise HTTPException(404, "Semestre introuvable")

    if body.is_current:
        db.query(Semester).filter(Semester.id != sem_id).update({"is_current": False})

    sem.name       = body.name
    sem.start_date = body.start_date
    sem.end_date   = body.end_date
    sem.is_current = body.is_current
    db.commit(); db.refresh(sem)
    return sem


@router.delete("/semesters/{sem_id}", status_code=204)
def delete_semester(
    sem_id: int,
    db:     Session = Depends(get_db),
    me:     User    = Depends(require_admin),
):
    sem = db.query(Semester).filter(Semester.id == sem_id).first()
    if not sem:
        raise HTTPException(404, "Semestre introuvable")
    db.delete(sem); db.commit()
