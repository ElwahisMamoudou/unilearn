"""
permissions.py — règles d'accès aux cours, partagées par toutes les routes.

Avant, ces fonctions étaient recopiées dans exams.py, homeworks.py, sessions.py,
courses.py et lessons.py. Une seule version à maintenant.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import ClassGroup, Course, Enrollment, User


def teacher_can_manage_course(course: Course, teacher_id: int, db: Session) -> bool:
    """Le professeur peut gérer le cours (le sien, ou un cours de sa classe)."""
    if course.teacher_id == teacher_id:
        return True
    if not course.class_group_id:
        return False
    class_group = db.query(ClassGroup).filter(ClassGroup.id == course.class_group_id).first()
    if class_group and class_group.teacher_id == teacher_id:
        return True
    return db.query(Course.id).filter(
        Course.class_group_id == course.class_group_id,
        Course.teacher_id == teacher_id,
    ).first() is not None


def ensure_course_access(course: Course, me: User, db: Session, manage: bool = False) -> None:
    """Lève une 403 si l'utilisateur n'a pas accès au cours (manage=True : réservé aux enseignants)."""
    if me.role == "admin":
        return
    if me.role == "teacher":
        if teacher_can_manage_course(course, me.id, db):
            return
        raise HTTPException(403, "Ce cours ne vous appartient pas")
    if manage:
        raise HTTPException(403, "Accès réservé aux enseignants")
    enrolled = db.query(Enrollment.id).filter_by(student_id=me.id, course_id=course.id).first()
    if not enrolled:
        raise HTTPException(403, "Vous n'êtes pas inscrit à ce cours")


def teacher_can_view_course(course: Course, teacher_id: int, db: Session) -> bool:
    """Le professeur peut consulter le cours (le sien, ou un cours de sa classe)."""
    if course.teacher_id == teacher_id:
        return True
    if not course.class_group_id:
        return False

    class_group = db.query(ClassGroup).filter(ClassGroup.id == course.class_group_id).first()
    if not class_group:
        return False
    if class_group.teacher_id == teacher_id:
        return True

    return db.query(Course.id).filter(
        Course.class_group_id == course.class_group_id,
        Course.teacher_id == teacher_id,
    ).first() is not None


def can_view_course(course: Course, me: User, db: Session) -> bool:
    """Admin : oui. Professeur : son cours / sa classe. Étudiant : s'il est inscrit."""
    if me.role == "admin":
        return True
    if me.role == "teacher":
        return teacher_can_view_course(course, me.id, db)
    return db.query(Enrollment.id).filter_by(
        student_id=me.id,
        course_id=course.id,
    ).first() is not None
