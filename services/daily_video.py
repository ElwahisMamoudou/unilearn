"""
services/daily_video.py
Gestion des salles Daily.co pour UniLearn.

API Daily utilisée :
  POST /v1/rooms  → créer une salle
  DELETE /v1/rooms/{name} → supprimer une salle
  POST /v1/meeting-tokens → générer un token (owner = modérateur)
"""
import os
import requests

DAILY_API_KEY = os.getenv("DAILY_API_KEY", "")
DAILY_BASE    = "https://api.daily.co/v1"
DAILY_DOMAIN  = "unilearn-hq.daily.co"


def _headers():
    return {
        "Authorization": f"Bearer {DAILY_API_KEY}",
        "Content-Type":  "application/json",
    }


def create_daily_room(room_name: str) -> dict:
    """
    Crée (ou récupère si elle existe déjà) une salle Daily.
    Retourne {"url": "...", "name": "..."}
    """
    payload = {
        "name":       room_name,
        "privacy":    "public",
        "properties": {
            "enable_chat":        True,
            "enable_screenshare": True,
            "start_video_off":    False,
            "start_audio_off":    False,
            "max_participants":   200,
        },
    }
    r = requests.post(f"{DAILY_BASE}/rooms", json=payload, headers=_headers(), timeout=10)

    # Si la salle existe déjà → Daily renvoie 409, on la récupère
    if r.status_code == 409:
        r = requests.get(f"{DAILY_BASE}/rooms/{room_name}", headers=_headers(), timeout=10)

    if not r.ok:
        raise Exception(f"Daily {r.status_code}: {r.text}")
    r.raise_for_status()
    data = r.json()
    url = data.get("url") or f"https://{DAILY_DOMAIN}/{room_name}"
    return {"url": url, "name": data["name"]}


def create_owner_token(room_name: str, user_name: str = "") -> str:
    """
    Génère un token 'owner' (modérateur) pour le prof.
    Avec ce token → pas d'écran 'attendre le modérateur'.
    """
    payload = {
        "properties": {
            "room_name":  room_name,
            "is_owner":   True,
            "user_name":  user_name,
            "enable_recording": "cloud",
        }
    }
    r = requests.post(f"{DAILY_BASE}/meeting-tokens", json=payload, headers=_headers(), timeout=10)
    r.raise_for_status()
    return r.json().get("token", "")


def create_participant_token(room_name: str, user_name: str = "") -> str:
    """
    Génère un token participant (étudiant) — peut rejoindre sans attendre.
    """
    payload = {
        "properties": {
            "room_name": room_name,
            "is_owner":  False,
            "user_name": user_name,
        }
    }
    r = requests.post(f"{DAILY_BASE}/meeting-tokens", json=payload, headers=_headers(), timeout=10)
    r.raise_for_status()
    return r.json().get("token", "")


def delete_daily_room(room_name: str) -> None:
    """Supprime une salle Daily (optionnel, appelé à la fin d'une session)."""
    try:
        requests.delete(f"{DAILY_BASE}/rooms/{room_name}", headers=_headers(), timeout=10)
    except Exception:
        pass
