import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional, TypedDict

logger = logging.getLogger(__name__)

YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube"]


class YouTubeLiveResult(TypedDict, total=False):
    broadcast_id: Optional[str]
    live_url: Optional[str]
    stream_key: Optional[str]
    video_id: Optional[str]


def _required_env() -> dict[str, Optional[str]]:
    return {
        "client_id": os.getenv("YOUTUBE_CLIENT_ID"),
        "client_secret": os.getenv("YOUTUBE_CLIENT_SECRET"),
        "refresh_token": os.getenv("YOUTUBE_REFRESH_TOKEN"),
        "channel_id": os.getenv("YOUTUBE_CHANNEL_ID"),
    }


def _youtube_client():
    values = _required_env()
    missing = [name for name, value in values.items() if not value]
    if missing:
        logger.warning("YouTube Live désactivé: variables manquantes: %s", ", ".join(missing))
        return None

    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    credentials = Credentials(
        token=None,
        refresh_token=values["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=values["client_id"],
        client_secret=values["client_secret"],
        scopes=YOUTUBE_SCOPES,
    )
    return build("youtube", "v3", credentials=credentials, cache_discovery=False)


def create_live_broadcast(title: str, description: str = "") -> YouTubeLiveResult:
    """Create a YouTube broadcast + stream, bind them, and return playback/stream metadata.

    YouTube API errors are logged and converted to empty values so starting a UniLearn
    live session never crashes when quota, credentials, or channel setup are unavailable.
    """
    youtube = _youtube_client()
    if youtube is None:
        return {
            "broadcast_id": None,
            "live_url": None,
            "stream_key": None,
            "video_id": None,
        }

    try:
        start_time = (datetime.now(timezone.utc) + timedelta(seconds=30)).isoformat()
        broadcast_response = youtube.liveBroadcasts().insert(
            part="snippet,status,contentDetails",
            body={
                "snippet": {
                    "title": title,
                    "description": description or title,
                    "scheduledStartTime": start_time,
                },
                "status": {
                    "privacyStatus": os.getenv("YOUTUBE_LIVE_PRIVACY", "unlisted"),
                    "selfDeclaredMadeForKids": False,
                },
                "contentDetails": {
                    "enableAutoStart": True,
                    "enableAutoStop": True,
                    "enableDvr": True,
                    "recordFromStart": True,
                },
            },
        ).execute()

        broadcast_id = broadcast_response.get("id")
        video_id = broadcast_id

        stream_response = youtube.liveStreams().insert(
            part="snippet,cdn",
            body={
                "snippet": {
                    "title": f"{title} — UniLearn stream",
                    "description": description or title,
                },
                "cdn": {
                    "frameRate": "variable",
                    "ingestionType": "rtmp",
                    "resolution": "variable",
                },
            },
        ).execute()

        stream_id = stream_response.get("id")
        ingestion_info = stream_response.get("cdn", {}).get("ingestionInfo", {})
        stream_key = ingestion_info.get("streamName")

        if broadcast_id and stream_id:
            youtube.liveBroadcasts().bind(
                part="id,contentDetails",
                id=broadcast_id,
                streamId=stream_id,
            ).execute()

        live_url = f"https://www.youtube.com/watch?v={video_id}" if video_id else None
        return {
            "broadcast_id": broadcast_id,
            "live_url": live_url,
            "stream_key": stream_key,
            "video_id": video_id,
        }
    except Exception:
        logger.exception("Erreur YouTube Live API lors de la création du live")

    return {
        "broadcast_id": None,
        "live_url": None,
        "stream_key": None,
        "video_id": None,
    }


def end_live_broadcast(broadcast_id: Optional[str]) -> Optional[str]:
    """Complete a YouTube live broadcast and return its replay URL."""
    if not broadcast_id:
        return None

    youtube = _youtube_client()
    if youtube is None:
        return f"https://www.youtube.com/watch?v={broadcast_id}"

    try:
        youtube.liveBroadcasts().transition(
            broadcastStatus="complete",
            id=broadcast_id,
            part="id,status",
        ).execute()
    except Exception:
        logger.exception("Erreur YouTube Live API lors de la fin du live")

    return f"https://www.youtube.com/watch?v={broadcast_id}"
