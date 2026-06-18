#!/bin/sh
# Script de démarrage explicite : garantit que $PORT est résolu par un vrai
# shell, peu importe comment Railway invoque le conteneur (Start Command,
# override, etc.). Si $PORT n'est pas défini, on retombe sur 8080.
PORT="${PORT:-8080}"
echo "Starting uvicorn on port $PORT"
exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
