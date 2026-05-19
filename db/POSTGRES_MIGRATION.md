# Migration UniLearn de SQLite vers PostgreSQL

## 1. Installer les dépendances

```bash
pip install -r requirements.txt
```

## 2. Créer une base PostgreSQL

Tu peux utiliser Render, Railway, Supabase, Neon ou un PostgreSQL local.
Récupère l'URL de connexion au format :

```text
postgresql://USER:PASSWORD@HOST:5432/DB_NAME
```

> Le code accepte aussi les URLs `postgres://...` fournies par certains hébergeurs.

## 3. Configurer le backend

En production, ajoute cette variable d'environnement :

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME"
```

Si `DATABASE_URL` est absent, UniLearn continue d'utiliser SQLite localement :

```text
sqlite:///./db/unilearn.db
```

## 4. Migrer les données existantes SQLite vers PostgreSQL

Depuis la racine du projet :

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME"
python migrate_sqlite_to_postgres.py
```

Le script :

1. crée les tables manquantes dans PostgreSQL ;
2. vide les tables PostgreSQL cibles ;
3. copie les données de `db/unilearn.db` ;
4. réinitialise les séquences PostgreSQL.

⚠️ Lance-le de préférence sur une base PostgreSQL vide, car il efface les tables UniLearn avant de recopier les données.

## 5. Lancer l'application avec PostgreSQL

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME"
uvicorn main:app --reload
```

Au démarrage, `init_db()` crée automatiquement les tables manquantes.
