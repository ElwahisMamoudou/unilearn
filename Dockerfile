# ════════════════════════════════════════════════════════════
# MultiStage Build — UniLearn Production
# ════════════════════════════════════════════════════════════
# Stage 1: Builder
FROM python:3.11-slim as builder
WORKDIR /app

# Installer les dépendances système
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copier requirements
COPY requirements.txt .

# Installer les dépendances Python dans un virtualenv
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim
WORKDIR /app

# Installer runtime essentials (curl est requis par le HEALTHCHECK ci-dessous)
RUN apt-get update && apt-get install -y \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copier le virtualenv du builder
COPY --from=builder /opt/venv /opt/venv

# Copier l'application
COPY . .

# Créer répertoire uploads
RUN mkdir -p uploads/{lessons,homeworks,submissions,recordings,exams}

# Variable d'environnement pour le venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

# Port d'écoute (documentaire seulement — Docker n'expand pas $PORT ici ;
# Railway injecte $PORT au runtime ; le vrai binding se fait dans CMD ci-dessous)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Lancer l'app — forme SHELL (sans crochets) pour que $PORT soit résolu
# au runtime. Railway injecte $PORT dynamiquement ; en forme JSON/exec
# (avec crochets), $PORT n'est jamais substitué et l'app écoute toujours
# sur 8080 même si Railway route vers un autre port → 502 "Application
# failed to respond" sur toutes les requêtes.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
