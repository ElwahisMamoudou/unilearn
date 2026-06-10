"""
routes/webrtc.py
Serveur de signaling WebRTC pour UniLearn.

Rôle : relayer les messages ICE/SDP entre participants d'une même salle.
Le flux vidéo lui-même est peer-to-peer (navigateur ↔ navigateur),
ce serveur ne voit jamais les données vidéo.

Protocole (JSON sur WebSocket) :
  → { type: "join",    room: "...", user_id: "...", user_name: "..." }
  → { type: "offer",   to: "...", sdp: {...} }
  → { type: "answer",  to: "...", sdp: {...} }
  → { type: "ice",     to: "...", candidate: {...} }
  ← { type: "peers",   peers: [{id, name}] }
  ← { type: "offer",   from: "...", from_name: "...", sdp: {...} }
  ← { type: "answer",  from: "...", sdp: {...} }
  ← { type: "ice",     from: "...", candidate: {...} }
  ← { type: "peer_left", peer_id: "..." }
"""

import json
import uuid
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# rooms[room_id] = { peer_id: {"ws": WebSocket, "name": str} }
rooms: Dict[str, Dict[str, dict]] = {}


async def broadcast_to_room(room_id: str, message: dict, exclude: str = None):
    if room_id not in rooms:
        return
    dead = []
    for peer_id, peer in rooms[room_id].items():
        if peer_id == exclude:
            continue
        try:
            await peer["ws"].send_text(json.dumps(message))
        except Exception:
            dead.append(peer_id)
    for d in dead:
        rooms[room_id].pop(d, None)


async def send_to_peer(room_id: str, peer_id: str, message: dict):
    peer = rooms.get(room_id, {}).get(peer_id)
    if peer:
        try:
            await peer["ws"].send_text(json.dumps(message))
        except Exception:
            pass


@router.websocket("/ws/room/{room_id}")
async def webrtc_signaling(ws: WebSocket, room_id: str):
    await ws.accept()

    peer_id   = uuid.uuid4().hex[:12]
    peer_name = "Participant"

    # Initialiser la salle si besoin
    if room_id not in rooms:
        rooms[room_id] = {}

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            mtype = msg.get("type")

            # ── Rejoindre la salle ──
            if mtype == "join":
                peer_name = msg.get("user_name", "Participant")[:60]

                # Envoyer la liste des pairs existants à ce nouveau pair
                existing = [
                    {"id": pid, "name": p["name"]}
                    for pid, p in rooms[room_id].items()
                ]
                await ws.send_text(json.dumps({
                    "type":    "welcome",
                    "peer_id": peer_id,
                    "peers":   existing,
                }))

                # Annoncer l'arrivée aux pairs existants
                await broadcast_to_room(room_id, {
                    "type":      "peer_joined",
                    "peer_id":   peer_id,
                    "peer_name": peer_name,
                })

                # Enregistrer ce pair
                rooms[room_id][peer_id] = {"ws": ws, "name": peer_name}

            # ── Relayer offer / answer / ice ──
            elif mtype in ("offer", "answer", "ice"):
                to = msg.get("to")
                payload = {
                    "type":      mtype,
                    "from":      peer_id,
                    "from_name": peer_name,
                }
                if mtype in ("offer", "answer"):
                    payload["sdp"] = msg.get("sdp")
                else:
                    payload["candidate"] = msg.get("candidate")

                if to:
                    await send_to_peer(room_id, to, payload)
                else:
                    await broadcast_to_room(room_id, payload, exclude=peer_id)

    except WebSocketDisconnect:
        pass
    finally:
        # Nettoyer et prévenir les autres
        rooms.get(room_id, {}).pop(peer_id, None)
        if room_id in rooms and not rooms[room_id]:
            del rooms[room_id]
        await broadcast_to_room(room_id, {
            "type":    "peer_left",
            "peer_id": peer_id,
        })
