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

# Script de démarrage : résout $PORT lui-même via un shell explicite.
# On a constaté que CMD avec expansion ${PORT:-8080} arrivait à uvicorn
# comme texte littéral (Railway invoque probablement le conteneur d'une
# façon qui ne passe pas par /bin/sh -c). Un script dédié + exec garantit
# la résolution peu importe comment le conteneur est lancé.
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Créer répertoire uploads
RUN mkdir -p uploads/{lessons,homeworks,submissions,recordings,exams}

# Variable d'environnement pour le venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

# Port d'écoute (documentaire seulement — Railway injecte $PORT au runtime)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Lancer l'app via le script (forme exec, mais le script lui-même fait
# l'expansion de $PORT en interne avec /bin/sh)
CMD ["/app/start.sh"]
