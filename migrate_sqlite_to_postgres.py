"""Migrate UniLearn data from local SQLite to PostgreSQL.

Usage:
    # 1) Configure the target PostgreSQL URL
    export DATABASE_URL="postgresql://user:password@host:5432/unilearn"

    # 2) Run from the repository root
    python migrate_sqlite_to_postgres.py

The script creates missing PostgreSQL tables, then copies rows from
./db/unilearn.db into PostgreSQL while preserving primary-key IDs.
Run it on an empty PostgreSQL database to avoid duplicate-key errors.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, delete, func, select, text
from sqlalchemy.engine import Engine

# Importing models also gives us the canonical SQLAlchemy metadata.
from models import Base, DEFAULT_DATABASE_URL, _normalize_database_url

SQLITE_URL = os.getenv("SQLITE_DATABASE_URL", DEFAULT_DATABASE_URL)
POSTGRES_URL = _normalize_database_url(os.getenv("DATABASE_URL", ""))


def _is_postgres(url: str) -> bool:
    return url.startswith("postgresql")


def _make_engine(url: str) -> Engine:
    kwargs = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(url, **kwargs)


def _reset_postgres_sequence(conn, table) -> None:
    pk_columns = list(table.primary_key.columns)
    if len(pk_columns) != 1:
        return
    pk = pk_columns[0]
    try:
        python_type = pk.type.python_type
    except NotImplementedError:
        return
    if python_type is not int:
        return

    seq_sql = text("SELECT pg_get_serial_sequence(:table_name, :column_name)")
    sequence = conn.execute(seq_sql, {
        "table_name": table.name,
        "column_name": pk.name,
    }).scalar()
    if not sequence:
        return

    max_id = conn.execute(select(func.max(pk))).scalar() or 0
    conn.execute(text("SELECT setval(CAST(:sequence_name AS regclass), :next_value, true)"), {
        "sequence_name": sequence,
        "next_value": max_id,
    })


def main() -> int:
    sqlite_path = Path("db/unilearn.db")
    if SQLITE_URL == DEFAULT_DATABASE_URL and not sqlite_path.exists():
        print("❌ SQLite introuvable : db/unilearn.db")
        return 1

    if not POSTGRES_URL:
        print("❌ DATABASE_URL PostgreSQL manquant.")
        print("   Exemple : export DATABASE_URL='postgresql://user:password@host:5432/unilearn'")
        return 1
    if not _is_postgres(POSTGRES_URL):
        print("❌ DATABASE_URL doit pointer vers PostgreSQL pour cette migration.")
        print(f"   Reçu : {POSTGRES_URL}")
        return 1

    source = _make_engine(SQLITE_URL)
    target = _make_engine(POSTGRES_URL)

    print("🔧 Création des tables PostgreSQL manquantes...")
    Base.metadata.create_all(bind=target)

    with source.connect() as src, target.begin() as dst:
        print("🧹 Nettoyage de la base PostgreSQL cible...")
        for table in reversed(Base.metadata.sorted_tables):
            dst.execute(delete(table))

        print("📦 Copie des données SQLite → PostgreSQL...")
        for table in Base.metadata.sorted_tables:
            rows = [dict(row._mapping) for row in src.execute(select(table)).all()]
            if not rows:
                print(f"   - {table.name}: 0 ligne")
                continue
            dst.execute(table.insert(), rows)
            print(f"   - {table.name}: {len(rows)} ligne(s)")

        print("🔢 Réinitialisation des séquences PostgreSQL...")
        for table in Base.metadata.sorted_tables:
            _reset_postgres_sequence(dst, table)

    print("✅ Migration terminée avec succès.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
