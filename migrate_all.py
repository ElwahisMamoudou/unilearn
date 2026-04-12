"""
migrate_all.py — Migration complète UniLearn
Ajoute TOUTES les colonnes/tables manquantes sans perdre les données.

Usage :
    cd backend
    python migrate_all.py
"""
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "db", "unilearn.db")


def get_columns(cur, table):
    cur.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cur.fetchall()}


def get_tables(cur):
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return {row[0] for row in cur.fetchall()}


def run():
    if not os.path.exists(DB_PATH):
        print(f"❌ Base introuvable : {DB_PATH}")
        print("   Lancez d'abord : uvicorn main:app --reload (pour créer la DB)")
        return

    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()
    tables = get_tables(cur)

    print("=" * 55)
    print("  UniLearn — Migration complète")
    print("=" * 55)

    # ──────────────────────────────────────────────────────
    # 1. TABLE class_groups
    # ──────────────────────────────────────────────────────
    if "class_groups" not in tables:
        cur.execute("""
            CREATE TABLE class_groups (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                name             VARCHAR(100) NOT NULL,
                code             VARCHAR(20),
                description      TEXT,
                level            VARCHAR(50),
                academic_year_id INTEGER REFERENCES academic_years(id),
                teacher_id       INTEGER REFERENCES users(id),
                max_students     INTEGER DEFAULT 50,
                is_active        BOOLEAN DEFAULT 1,
                created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("✅  Table 'class_groups' créée")
    else:
        print("ℹ️   Table 'class_groups' déjà présente")

    # ──────────────────────────────────────────────────────
    # 2. TABLE class_students (association)
    # ──────────────────────────────────────────────────────
    if "class_students" not in tables:
        cur.execute("""
            CREATE TABLE class_students (
                class_id   INTEGER REFERENCES class_groups(id),
                student_id INTEGER REFERENCES users(id),
                PRIMARY KEY (class_id, student_id)
            )
        """)
        print("✅  Table 'class_students' créée")
    else:
        print("ℹ️   Table 'class_students' déjà présente")

    # ──────────────────────────────────────────────────────
    # 3. TABLE academic_years (si absente)
    # ──────────────────────────────────────────────────────
    if "academic_years" not in tables:
        cur.execute("""
            CREATE TABLE academic_years (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       VARCHAR(20) NOT NULL,
                start_date DATETIME NOT NULL,
                end_date   DATETIME NOT NULL,
                is_current BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("✅  Table 'academic_years' créée")
    else:
        print("ℹ️   Table 'academic_years' déjà présente")

    # ──────────────────────────────────────────────────────
    # 4. TABLE semesters (si absente)
    # ──────────────────────────────────────────────────────
    if "semesters" not in tables:
        cur.execute("""
            CREATE TABLE semesters (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                academic_year_id INTEGER REFERENCES academic_years(id),
                name             VARCHAR(50) NOT NULL,
                start_date       DATETIME NOT NULL,
                end_date         DATETIME NOT NULL,
                is_current       BOOLEAN DEFAULT 0
            )
        """)
        print("✅  Table 'semesters' créée")
    else:
        print("ℹ️   Table 'semesters' déjà présente")

    # ──────────────────────────────────────────────────────
    # 5. COLONNES MANQUANTES dans 'courses'
    # ──────────────────────────────────────────────────────
    course_cols = get_columns(cur, "courses")
    course_migrations = [
        ("semester_id",    "ALTER TABLE courses ADD COLUMN semester_id INTEGER REFERENCES semesters(id)"),
        ("class_group_id", "ALTER TABLE courses ADD COLUMN class_group_id INTEGER REFERENCES class_groups(id)"),
    ]
    for col, sql in course_migrations:
        if col not in course_cols:
            cur.execute(sql)
            print(f"✅  courses.{col} ajoutée")
        else:
            print(f"ℹ️   courses.{col} déjà présente")

    # ──────────────────────────────────────────────────────
    # 6. COLONNES MANQUANTES dans 'users'
    # ──────────────────────────────────────────────────────
    user_cols = get_columns(cur, "users")
    user_migrations = [
        ("matricule", "ALTER TABLE users ADD COLUMN matricule VARCHAR(50)"),
    ]
    for col, sql in user_migrations:
        if col not in user_cols:
            cur.execute(sql)
            print(f"✅  users.{col} ajoutée")
        else:
            print(f"ℹ️   users.{col} déjà présente")

    # ──────────────────────────────────────────────────────
    # 7. COLONNES MANQUANTES dans 'exams' (paramètres Moodle)
    # ──────────────────────────────────────────────────────
    if "exams" in tables:
        exam_cols = get_columns(cur, "exams")
        exam_migrations = [
            ("shuffle_questions", "ALTER TABLE exams ADD COLUMN shuffle_questions BOOLEAN DEFAULT 0"),
            ("max_attempts",      "ALTER TABLE exams ADD COLUMN max_attempts INTEGER DEFAULT 1"),
            ("passing_score",     "ALTER TABLE exams ADD COLUMN passing_score REAL"),
            ("show_score_after",  "ALTER TABLE exams ADD COLUMN show_score_after VARCHAR(20) DEFAULT 'immediately'"),
        ]
        for col, sql in exam_migrations:
            if col not in exam_cols:
                cur.execute(sql)
                print(f"✅  exams.{col} ajoutée")
            else:
                print(f"ℹ️   exams.{col} déjà présente")

    # ──────────────────────────────────────────────────────
    # 8. TABLE login_history (si absente)
    # ──────────────────────────────────────────────────────
    if "login_history" not in tables:
        cur.execute("""
            CREATE TABLE login_history (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER REFERENCES users(id) NOT NULL,
                ip_address VARCHAR(50),
                user_agent VARCHAR(300),
                success    BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("✅  Table 'login_history' créée")
    else:
        print("ℹ️   Table 'login_history' déjà présente")

    # ──────────────────────────────────────────────────────
    # 9. TABLE notifications (si absente)
    # ──────────────────────────────────────────────────────
    if "notifications" not in tables:
        cur.execute("""
            CREATE TABLE notifications (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER REFERENCES users(id) NOT NULL,
                type       VARCHAR(50) NOT NULL,
                title      VARCHAR(200) NOT NULL,
                body       TEXT,
                link       VARCHAR(300),
                is_read    BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("✅  Table 'notifications' créée")
    else:
        print("ℹ️   Table 'notifications' déjà présente")

    # ──────────────────────────────────────────────────────
    # 10. TABLE homeworks (si absente)
    # ──────────────────────────────────────────────────────
    if "homeworks" not in tables:
        cur.execute("""
            CREATE TABLE homeworks (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id    INTEGER REFERENCES courses(id) NOT NULL,
                title        VARCHAR(200) NOT NULL,
                description  TEXT,
                due_date     DATETIME NOT NULL,
                max_score    REAL DEFAULT 20.0,
                is_published BOOLEAN DEFAULT 0,
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("✅  Table 'homeworks' créée")
    else:
        print("ℹ️   Table 'homeworks' déjà présente")

    # ──────────────────────────────────────────────────────
    # 11. TABLE homework_submissions (si absente)
    # ──────────────────────────────────────────────────────
    if "homework_submissions" not in tables:
        cur.execute("""
            CREATE TABLE homework_submissions (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                homework_id  INTEGER REFERENCES homeworks(id) NOT NULL,
                student_id   INTEGER REFERENCES users(id) NOT NULL,
                file_path    VARCHAR(400),
                comment      TEXT,
                score        REAL,
                feedback     TEXT,
                graded       BOOLEAN DEFAULT 0,
                submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                late         BOOLEAN DEFAULT 0
            )
        """)
        print("✅  Table 'homework_submissions' créée")
    else:
        print("ℹ️   Table 'homework_submissions' déjà présente")

    conn.commit()
    conn.close()

    print()
    print("=" * 55)
    print("  ✅  Migration terminée avec succès !")
    print("  👉  Redémarrez le serveur : uvicorn main:app --reload")
    print("=" * 55)


if __name__ == "__main__":
    run()
