"""
services/daily_video.py
"""
import os
import time
import requests

DAILY_API_KEY = os.getenv("DAILY_API_KEY", "")
DAILY_BASE    = "https://api.daily.co/v1"


def _headers():
    return {
        "Authorization": f"Bearer {DAILY_API_KEY}",
        "Content-Type":  "application/json",
    }


def create_daily_room(room_name: str) -> dict:
    payload = {
        "name":    room_name,
        "privacy": "public",
        "properties": {
            "enable_chat":        True,
            "enable_screenshare": True,
            "start_video_off":    False,
            "start_audio_off":    False,
            "max_participants":   200,
            # enable_recording "cloud" retiré — nécessite un plan payant Daily
            # exp retiré — null causait le 400
        },
    }
    r = requests.post(
        f"{DAILY_BASE}/rooms",
        json=payload,
        headers=_headers(),
        timeout=10,
    )
    if r.status_code == 409:
        r = requests.get(
            f"{DAILY_BASE}/rooms/{room_name}",
            headers=_headers(),
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        return {"url": data["url"], "name": data["name"]}

    if not r.ok:
        # Message d'erreur complet pour debug
        raise Exception(f"{r.status_code} {r.text}")

    data = r.json()
    return {"url": data["url"], "name": data["name"]}


def create_owner_token(room_name: str, user_name: str = "") -> str:
    payload = {
        "properties": {
            "room_name": room_name,
            "is_owner":  True,
            "user_name": user_name,
            "exp":       int(time.time()) + 7200,
        }
    }
    r = requests.post(
        f"{DAILY_BASE}/meeting-tokens",
        json=payload,
        headers=_headers(),
        timeout=10,
    )
    if not r.ok:
        raise Exception(f"{r.status_code} {r.text}")
    return r.json().get("token", "")


def create_participant_token(room_name: str, user_name: str = "") -> str:
    payload = {
        "properties": {
            "room_name": room_name,
            "is_owner":  False,
            "user_name": user_name,
            "exp":       int(time.time()) + 7200,
        }
    }
    r = requests.post(
        f"{DAILY_BASE}/meeting-tokens",
        json=payload,
        headers=_headers(),
        timeout=10,
    )
    if not r.ok:
        raise Exception(f"{r.status_code} {r.text}")
    return r.json().get("token", "")


def delete_daily_room(room_name: str) -> None:
    try:
        requests.delete(
            f"{DAILY_BASE}/rooms/{room_name}",
            headers=_headers(),
            timeout=10,
        )
    except Exception:
        pass
