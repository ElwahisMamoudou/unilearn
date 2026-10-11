"""
group_access.py — restriction d'un devoir ou d'une discussion du forum à certains groupes d'un cours.

Règle : si un élément est limité à des groupes, un ÉTUDIANT ne le voit (et ne peut y participer) que
s'il est membre d'au moins un de ces groupes. Enseignants et administrateurs voient toujours tout.
"""
from collections import defaultdict
from typing import Dict, Iterable, List, Set

from sqlalchemy.orm import Session

from models import CourseGroup, CourseGroupMember, GroupRestriction, User

RESTRICTABLE = ("homework", "forum")


def allowed_ids_for_student(db: Session, me: User, target_type: str, ids: Iterable[int]) -> Set[int]:
    """Parmi `ids`, ceux auxquels l'étudiant a accès."""
    ids = list(ids)
    if not ids:
        return set()
    rows = db.query(GroupRestriction.target_id, GroupRestriction.group_id).filter(
        GroupRestriction.target_type == target_type, GroupRestriction.target_id.in_(ids)).all()
    if not rows:
        return set(ids)
    restricted = defaultdict(set)
    for target_id, group_id in rows:
        restricted[target_id].add(group_id)
    mine = {g for (g,) in db.query(CourseGroupMember.group_id).filter(CourseGroupMember.student_id == me.id)}
    return {i for i in ids if i not in restricted or restricted[i] & mine}


def student_can_access(db: Session, me: User, target_type: str, target_id: int) -> bool:
    if me.role != "student":
        return True
    return target_id in allowed_ids_for_student(db, me, target_type, [target_id])


def restricted_groups_map(db: Session, target_type: str, ids: Iterable[int]) -> Dict[int, List[dict]]:
    """{id de l'élément: [{id, name} des groupes autorisés]} — pour l'affichage côté enseignant."""
    ids = list(ids)
    out: Dict[int, List[dict]] = defaultdict(list)
    if not ids:
        return out
    rows = (db.query(GroupRestriction.target_id, CourseGroup.id, CourseGroup.name)
              .join(CourseGroup, CourseGroup.id == GroupRestriction.group_id)
              .filter(GroupRestriction.target_type == target_type, GroupRestriction.target_id.in_(ids))
              .order_by(CourseGroup.name).all())
    for target_id, gid, name in rows:
        out[target_id].append({"id": gid, "name": name})
    return out


def set_restrictions(db: Session, target_type: str, target_id: int, group_ids: Iterable[int]) -> None:
    db.query(GroupRestriction).filter_by(target_type=target_type, target_id=target_id).delete()
    for gid in dict.fromkeys(group_ids):
        db.add(GroupRestriction(group_id=gid, target_type=target_type, target_id=target_id))


def clear_restrictions(db: Session, target_type: str, target_id: int) -> None:
    """À appeler quand l'élément est supprimé (évite qu'un futur élément réutilise les mêmes restrictions)."""
    db.query(GroupRestriction).filter_by(target_type=target_type, target_id=target_id).delete()
