"""
seed_m1_mecatim_s7.py
=====================
Script d'insertion des données réelles Master 1 MecaTIM — Semestre 7
Université de Ngaoundéré

Usage :
    cd ~/unilearn/backend
    python seed_m1_mecatim_s7.py

Ce script :
  1. Crée les 4 catégories (UE) du Semestre 7
  2. Crée la classe "Master 1 MecaTIM"
  3. Crée l'année académique 2024-2025 (si elle n'existe pas)
  4. Crée les 12 cours (matières) liés à la classe et aux catégories
  5. N'écrase rien si les données existent déjà (idempotent)
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models import (
    SessionLocal, init_db,
    Category, Course, ClassGroup, AcademicYear, User
)
from datetime import datetime

# ─────────────────────────────────────────────
# CONFIG — modifie si nécessaire
# ─────────────────────────────────────────────
ADMIN_EMAIL      = "admin@unilearn.cm"   # email de l'admin existant
ACADEMIC_YEAR    = "2024-2025"
CLASS_NAME       = "Master 1 MecaTIM"
CLASS_CODE       = "M1-MecaTIM"
CLASS_LEVEL      = "Master 1"
CLASS_MAX        = 40

# ─────────────────────────────────────────────
# DONNÉES — UE et matières Semestre 7
# ─────────────────────────────────────────────

UE_DATA = [
    {
        "name":  "MK411 — Base professionnelle I",
        "color": "#0EA5E9",
        "courses": [
            {
                "code":        "ANT411",
                "title":       "ANT411 — Anglais technique – Techniques d'expression",
                "description": "Anglais Technique\nCommunication et technique d'expression française",
                "credits":     2,
            },
            {
                "code":        "CGE411",
                "title":       "CGE411 — Création et gestion d'entreprise",
                "description": "Création d'entreprise\nGestion d'entreprise",
                "credits":     2,
            },
            {
                "code":        "EJE411",
                "title":       "EJE411 — Environnement Juridique – HSE",
                "description": "Environnement Juridique des Entreprises\nHygiène, Sécurité et Environnement",
                "credits":     2,
            },
        ],
    },
    {
        "name":  "MK412 — Mathématiques Appliquées",
        "color": "#F59E0B",
        "courses": [
            {
                "code":        "PSA412",
                "title":       "PSA412 — Probabilité et Statistique appliquées",
                "description": (
                    "Probabilité et analyse combinatoires\n"
                    "Les variables aléatoires\n"
                    "Statistique descriptive\n"
                    "Echantillonnages et estimation des intervalles de confiance\n"
                    "Les tests statistiques"
                ),
                "credits":     2,
            },
            {
                "code":        "PBD412",
                "title":       "PBD412 — Programmation orientée objet et base de données",
                "description": (
                    "Algorithmique\n"
                    "Initiation à la programmation\n"
                    "Programmation orientée Objet\n"
                    "Initiation à la Base de données"
                ),
                "credits":     3,
            },
            {
                "code":        "ANU412",
                "title":       "ANU412 — Analyse numérique",
                "description": (
                    "Interpolation polynomiale\n"
                    "Résolution d'un système d'équations par itérations\n"
                    "Calcul numérique des dérivées\n"
                    "Recherche d'un extremum – Méthode des moindres carrés\n"
                    "Equations différentielles et systèmes différentiels"
                ),
                "credits":     3,
            },
        ],
    },
    {
        "name":  "MK413 — Électronique Appliquée I",
        "color": "#EF4444",
        "courses": [
            {
                "code":        "IIM413",
                "title":       "IIM413 — Capteurs et Instrumentation",
                "description": (
                    "Techniques de mesure\n"
                    "Outil logiciel pour Instrumentation\n"
                    "Capteurs et actionneurs"
                ),
                "credits":     2,
            },
            {
                "code":        "PBD413",
                "title":       "PBD413 — Électronique numérique et microcontrôleurs",
                "description": (
                    "Systèmes\n"
                    "Microcontrôleur\n"
                    "Microprocesseur"
                ),
                "credits":     2,
            },
            {
                "code":        "AIR413",
                "title":       "AIR413 — Automatique industrielle et Technique de régulation",
                "description": (
                    "Contrôle et commande des systèmes\n"
                    "Automatique et supervision industrielle"
                ),
                "credits":     3,
            },
        ],
    },
    {
        "name":  "MK414 — Maintenance Industrielle",
        "color": "#8B5CF6",
        "courses": [
            {
                "code":        "CTM414",
                "title":       "CTM414 — Concepts et techniques de maintenance",
                "description": (
                    "Différentes formes de maintenance\n"
                    "Fonctions et Documentation en maintenance\n"
                    "Gestion des opérations de maintenance\n"
                    "Total Productive Maintenance\n"
                    "L'industrie et la maintenance 4.0"
                ),
                "credits":     3,
            },
            {
                "code":        "GMO414",
                "title":       "GMO414 — GMAO – GPAO",
                "description": (
                    "Gestion de la maintenance assistée par ordinateur\n"
                    "Gestion de la production assistée par ordinateur"
                ),
                "credits":     3,
            },
            {
                "code":        "FAD414",
                "title":       "FAD414 — Sûreté de fonctionnement",
                "description": (
                    "Fiabilité opérationnelle et prédictive\n"
                    "Contrôle non destructif\n"
                    "Analyses physiques"
                ),
                "credits":     3,
            },
        ],
    },
]


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    init_db()
    db = SessionLocal()

    try:
        # 1. Récupérer l'admin
        admin = db.query(User).filter_by(email=ADMIN_EMAIL).first()
        if not admin:
            print(f"[ERREUR] Admin '{ADMIN_EMAIL}' introuvable. Vérifiez ADMIN_EMAIL.")
            return

        # 2. Année académique
        year = db.query(AcademicYear).filter_by(name=ACADEMIC_YEAR).first()
        if not year:
            year = AcademicYear(
                name       = ACADEMIC_YEAR,
                start_date = datetime(2024, 9, 1),
                end_date   = datetime(2025, 7, 31),
                is_current = True,
            )
            db.add(year); db.flush()
            print(f"[+] Année académique créée : {ACADEMIC_YEAR}")
        else:
            print(f"[=] Année académique existante : {ACADEMIC_YEAR}")

        # 3. Classe Master 1 MecaTIM
        cls = db.query(ClassGroup).filter_by(code=CLASS_CODE).first()
        if not cls:
            cls = ClassGroup(
                name             = CLASS_NAME,
                code             = CLASS_CODE,
                level            = CLASS_LEVEL,
                description      = "Master 1 MecaTIM — Mécatronique, Technologies Industrielles et Maintenance\nUniversité de Ngaoundéré",
                academic_year_id = year.id,
                teacher_id       = admin.id,
                max_students     = CLASS_MAX,
                is_active        = True,
            )
            db.add(cls); db.flush()
            print(f"[+] Classe créée : {CLASS_NAME} ({CLASS_CODE})")
        else:
            print(f"[=] Classe existante : {CLASS_NAME}")

        # 4. Catégories (UE) + Cours (matières)
        total_cats    = 0
        total_courses = 0

        for ue in UE_DATA:
            # Catégorie
            cat = db.query(Category).filter_by(name=ue["name"]).first()
            if not cat:
                cat = Category(name=ue["name"], color=ue["color"])
                db.add(cat); db.flush()
                total_cats += 1
                print(f"  [+] Catégorie : {ue['name']}")
            else:
                print(f"  [=] Catégorie existante : {ue['name']}")

            # Cours de l'UE
            for c in ue["courses"]:
                existing = db.query(Course).filter_by(
                    title          = c["title"],
                    class_group_id = cls.id,
                ).first()
                if not existing:
                    course = Course(
                        title          = c["title"],
                        description    = c["description"],
                        teacher_id     = admin.id,
                        category_id    = cat.id,
                        class_group_id = cls.id,
                        is_published   = True,
                    )
                    db.add(course)
                    total_courses += 1
                    print(f"    [+] Cours : {c['title']}")
                else:
                    print(f"    [=] Cours existant : {c['title']}")

        db.commit()

        print()
        print("=" * 55)
        print(f"✅ Terminé !")
        print(f"   {total_cats} catégorie(s) créée(s)")
        print(f"   {total_courses} cours créé(s)")
        print(f"   Classe : {CLASS_NAME} ({CLASS_CODE})")
        print(f"   Année  : {ACADEMIC_YEAR}")
        print()
        print("⚠️  N'oublie pas d'assigner les vrais enseignants")
        print("   depuis la page Administration → Cours.")
        print("=" * 55)

    except Exception as e:
        db.rollback()
        print(f"[ERREUR] {e}")
        import traceback; traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    main()
