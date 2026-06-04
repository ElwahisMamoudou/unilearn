from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import requests
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

class CodeRequest(BaseModel):
    code: str

@router.post("/youtube/callback")
async def youtube_callback(req: CodeRequest):
    """Échange le code OAuth contre refresh_token"""
    try:
        CLIENT_ID = os.getenv("YOUTUBE_CLIENT_ID")
        CLIENT_SECRET = os.getenv("YOUTUBE_CLIENT_SECRET")
        REDIRECT_URI = os.getenv("YOUTUBE_REDIRECT_URI", 
                                  "https://unilearn-hrrk-7y08uq5tr-elwahismamoudous-projects.vercel.app/callback")

        # Échanger le code contre access_token + refresh_token
        token_response = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": req.code,
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "redirect_uri": REDIRECT_URI,
                "grant_type": "authorization_code"
            }
        )

        if token_response.status_code != 200:
            logger.error(f"❌ Erreur token: {token_response.text}")
            return {"success": False, "error": "Échange échoué"}

        tokens = token_response.json()
        refresh_token = tokens.get("refresh_token")
        
        if not refresh_token:
            return {"success": False, "error": "Pas de refresh_token reçu"}

        # 🔥 IMPORTANT — Affichage du REFRESH_TOKEN
        logger.warning(f"\n\n===== YOUTUBE REFRESH_TOKEN =====")
        logger.warning(f"COPIE CETTE VALEUR DANS RAILWAY :")
        logger.warning(f"{refresh_token}")
        logger.warning(f"==================================\n")
        
        return {
            "success": True,
            "refresh_token": refresh_token,
            "message": "✅ REFRESH_TOKEN obtenu ! Copie-le dans Railway"
        }

    except Exception as e:
        logger.error(f"❌ Erreur callback: {str(e)}")
        return {"success": False, "error": str(e)}
