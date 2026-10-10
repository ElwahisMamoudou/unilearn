"""Groupes à l'intérieur d'un cours (comme les « groupes » de Moodle)."""
import math
import random
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_user
from models import Course, CourseGroup, CourseGroupMember, Enrollment, User, get_db
from permissions import ensure_course_access

router = APIRouter(prefix="/api/courses/{course_id}/groups", tags=["groups"])


class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=300)


class MembersIn(BaseModel):
    student_ids: List[int]


class AutoIn(BaseModel):
    by: str = "count"                 # "count" = nombre de groupes, "size" = étudiants par groupe
    value: int = Field(ge=1, le=200)
    prefix: str = Field(default="Groupe", max_length=60)
    order: str = "random"             # "random" ou "alpha"
    only_ungrouped: bool = True


def _course(db: Session, course_id: int) -> Course:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")
    return course


def _enrolled_students(db: Session, course_id: int) -> List[User]:
    return [e.student for e in db.query(Enrollment).filter_by(course_id=course_id).all() if e.student]


def _out(g: CourseGroup) -> dict:
    members = sorted((m.student for m in g.members if m.student), key=lambda u: u.name.lower())
    return {
        "id": g.id, "name": g.name, "description": g.description, "count": len(members),
        "members": [{"id": u.id, "name": u.name, "email": u.email} for u in members],
    }


def _find(db: Session, course_id: int, group_id: int) -> CourseGroup:
    g = db.query(CourseGroup).filter_by(id=group_id, course_id=course_id).first()
    if not g:
        raise HTTPException(404, "Groupe introuvable")
    return g


@router.get("")
def list_groups(course_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    course = _course(db, course_id)
    if me.role == "student":
        ensure_course_access(course, me, db)
        mine = [g for g in course.groups if any(m.student_id == me.id for m in g.members)]
        return {"groups": [_out(g) for g in sorted(mine, key=lambda g: g.name.lower())], "ungrouped": []}
    ensure_course_access(course, me, db, manage=True)
    groups = sorted(course.groups, key=lambda g: g.name.lower())
    grouped = {m.student_id for g in groups for m in g.members}
    ungrouped = [{"id": u.id, "name": u.name, "email": u.email}
                 for u in _enrolled_students(db, course_id) if u.id not in grouped]
    students = sorted(({"id": u.id, "name": u.name, "email": u.email} for u in _enrolled_students(db, course_id)),
                      key=lambda u: u["name"].lower())
    return {"groups": [_out(g) for g in groups], "students": students,
            "ungrouped": sorted(ungrouped, key=lambda u: u["name"].lower())}


@router.post("", status_code=201)
def create_group(course_id: int, body: GroupIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    course = _course(db, course_id)
    ensure_course_access(course, me, db, manage=True)
    name = body.name.strip()
    if db.query(CourseGroup).filter_by(course_id=course_id, name=name).first():
        raise HTTPException(400, "Un groupe porte déjà ce nom dans ce cours")
    g = CourseGroup(course_id=course_id, name=name, description=body.description)
    db.add(g)
    db.commit()
    db.refresh(g)
    return _out(g)


@router.post("/auto", status_code=201)
def create_groups_automatically(course_id: int, body: AutoIn, db: Session = Depends(get_db),
                                me: User = Depends(get_current_user)):
    """Crée plusieurs groupes d'un coup et répartit les étudiants (aléatoirement ou par ordre alphabétique)."""
    course = _course(db, course_id)
    ensure_course_access(course, me, db, manage=True)
    if body.by not in ("count", "size") or body.order not in ("random", "alpha"):
        raise HTTPException(400, "Paramètres invalides")

    students = _enrolled_students(db, course_id)
    if body.only_ungrouped:
        grouped = {m.student_id for g in course.groups for m in g.members}
        students = [s for s in students if s.id not in grouped]
    if not students:
        raise HTTPException(400, "Aucun étudiant à répartir")

    if body.order == "random":
        random.shuffle(students)
    else:
        students.sort(key=lambda u: u.name.lower())

    n = body.value if body.by == "count" else math.ceil(len(students) / body.value)
    n = max(1, min(n, len(students), 50))

    existing = {g.name for g in course.groups}
    groups, k = [], 1
    while len(groups) < n:
        name = f"{body.prefix.strip() or 'Groupe'} {k}"
        k += 1
        if name in existing:
            continue
        g = CourseGroup(course_id=course_id, name=name)
        db.add(g)
        groups.append(g)
    db.flush()
    for i, s in enumerate(students):
        db.add(CourseGroupMember(group_id=groups[i % n].id, student_id=s.id))
    db.commit()
    return {"created": len(groups), "students": len(students)}


@router.put("/{group_id}")
def update_group(course_id: int, group_id: int, body: GroupIn, db: Session = Depends(get_db),
                 me: User = Depends(get_current_user)):
    course = _course(db, course_id)
    ensure_course_access(course, me, db, manage=True)
    g = _find(db, course_id, group_id)
    name = body.name.strip()
    clash = db.query(CourseGroup).filter(CourseGroup.course_id == course_id, CourseGroup.name == name,
                                         CourseGroup.id != group_id).first()
    if clash:
        raise HTTPException(400, "Un groupe porte déjà ce nom dans ce cours")
    g.name, g.description = name, body.description
    db.commit()
    return _out(g)


@router.delete("/{group_id}", status_code=204)
def delete_group(course_id: int, group_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    course = _course(db, course_id)
    ensure_course_access(course, me, db, manage=True)
    db.delete(_find(db, course_id, group_id))
    db.commit()


@router.post("/{group_id}/members")
def add_members(course_id: int, group_id: int, body: MembersIn, db: Session = Depends(get_db),
                me: User = Depends(get_current_user)):
    course = _course(db, course_id)
    ensure_course_access(course, me, db, manage=True)
    g = _find(db, course_id, group_id)
    enrolled = {u.id for u in _enrolled_students(db, course_id)}
    already = {m.student_id for m in g.members}
    for sid in dict.fromkeys(body.student_ids):
        if sid in enrolled and sid not in already:
            db.add(CourseGroupMember(group_id=g.id, student_id=sid))
    db.commit()
    db.refresh(g)
    return _out(g)


@router.delete("/{group_id}/members/{student_id}", status_code=204)
def remove_member(course_id: int, group_id: int, student_id: int, db: Session = Depends(get_db),
                  me: User = Depends(get_current_user)):
    course = _course(db, course_id)
    ensure_course_access(course, me, db, manage=True)
    _find(db, course_id, group_id)
    row = db.query(CourseGroupMember).filter_by(group_id=group_id, student_id=student_id).first()
    if not row:
        raise HTTPException(404, "Cet étudiant n'est pas dans le groupe")
    db.delete(row)
    db.commit()
