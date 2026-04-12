# ─── AJOUT À COLLER dans la classe Exam (models.py) ──────────────────────────
#
# Ajoutez ces 4 colonnes dans la classe Exam, après la ligne `is_published` :
#
#     shuffle_questions = Column(Boolean, default=False)
#     max_attempts      = Column(Integer, default=1)          # 0 = illimité
#     passing_score     = Column(Float,   nullable=True)      # % note de passage
#     show_score_after  = Column(String(20), default="immediately")
#                         # "immediately" | "after_grading" | "never"
#
# Exemple de bloc complet pour la classe Exam :
# ─────────────────────────────────────────────

"""
class Exam(Base):
    __tablename__ = "exams"
    id           = Column(Integer, primary_key=True, index=True)
    course_id    = Column(Integer, ForeignKey("courses.id"), nullable=False)
    title        = Column(String(200), nullable=False)
    description  = Column(Text, nullable=True)
    duration_min = Column(Integer, default=60)
    starts_at    = Column(DateTime, nullable=True)
    ends_at      = Column(DateTime, nullable=True)
    is_published = Column(Boolean, default=False)
    created_at   = Column(DateTime, default=datetime.utcnow)

    # ── Paramètres Moodle ──────────────────────
    shuffle_questions = Column(Boolean, default=False)
    max_attempts      = Column(Integer, default=1)
    passing_score     = Column(Float, nullable=True)
    show_score_after  = Column(String(20), default="immediately")

    course      = relationship("Course",         back_populates="exams")
    questions   = relationship("ExamQuestion",   back_populates="exam", cascade="all, delete")
    submissions = relationship("ExamSubmission", back_populates="exam", cascade="all, delete")
"""

# ─── MIGRATION SQLite (si la DB existe déjà) ─────────────────────────────────
# Lancez ce script UNE SEULE FOIS pour ajouter les colonnes sans perdre vos données :

import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "db", "unilearn.db")

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()

    migrations = [
        ("shuffle_questions", "ALTER TABLE exams ADD COLUMN shuffle_questions BOOLEAN DEFAULT 0"),
        ("max_attempts",      "ALTER TABLE exams ADD COLUMN max_attempts INTEGER DEFAULT 1"),
        ("passing_score",     "ALTER TABLE exams ADD COLUMN passing_score REAL"),
        ("show_score_after",  "ALTER TABLE exams ADD COLUMN show_score_after VARCHAR(20) DEFAULT 'immediately'"),
    ]

    cur.execute("PRAGMA table_info(exams)")
    existing_cols = {row[1] for row in cur.fetchall()}

    added = []
    for col_name, sql in migrations:
        if col_name not in existing_cols:
            cur.execute(sql)
            added.append(col_name)
            print(f"  ✅ Colonne ajoutée : {col_name}")
        else:
            print(f"  ℹ️  Colonne déjà présente : {col_name}")

    conn.commit()
    conn.close()
    print(f"\nMigration terminée. {len(added)} colonne(s) ajoutée(s).")

if __name__ == "__main__":
    migrate()
