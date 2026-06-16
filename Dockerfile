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

# Installer runtime essentials
RUN apt-get update && apt-get install -y \
    libpq5 \
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

# Port d'écoute
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Lancer l'app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
