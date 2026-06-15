"""
Service d'envoi d'emails pour UniLearn.
Configure via variables d'environnement (fichier .env).

Variables requises :
  SMTP_HOST     — ex: smtp.gmail.com
  SMTP_PORT     — ex: 587
  SMTP_USER     — adresse d'envoi
  SMTP_PASSWORD — mot de passe (ou App Password Gmail)
  SMTP_FROM     — "UniLearn <noreply@unilearn.cm>"
"""

import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText
from typing import Optional

logger = logging.getLogger("unilearn.email")

# ── Config SMTP depuis l'environnement ────────────
SMTP_HOST     = os.getenv("SMTP_HOST",     "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER",     "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM     = os.getenv("SMTP_FROM",     f"UniLearn <{SMTP_USER}>")
EMAIL_ENABLED = bool(SMTP_USER and SMTP_PASSWORD)


def _send(to: str, subject: str, html: str, text: str) -> bool:
    """Envoie un email. Retourne True si succès, False sinon (jamais d'exception)."""
    if not EMAIL_ENABLED:
        logger.warning(f"Email désactivé (SMTP_USER non configuré). Destinataire : {to}")
        logger.info(f"[EMAIL SIMULÉ] À : {to} | Sujet : {subject}")
        logger.info(f"[EMAIL SIMULÉ] Contenu texte :\n{text}")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = SMTP_FROM
        msg["To"]      = to
        msg.attach(MIMEText(text, "plain",  "utf-8"))
        msg.attach(MIMEText(html, "html",   "utf-8"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, to, msg.as_string())

        logger.info(f"Email envoyé → {to} | {subject}")
        return True

    except Exception as e:
        logger.error(f"Échec envoi email → {to} : {e}")
        return False


# ── Template HTML générique ───────────────────────
def _html_template(title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:10px;overflow:hidden;
                    box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- En-tête -->
        <tr>
          <td style="background:#1e3a5f;padding:24px 32px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:0.5px;">
              UniLearn
            </h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:13px;">
              Université de Ngaoundéré
            </p>
          </td>
        </tr>

        <!-- Corps -->
        <tr>
          <td style="padding:32px;">
            {body_html}
          </td>
        </tr>

        <!-- Pied de page -->
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;
                     border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
              Ce message a été envoyé automatiquement par la plateforme UniLearn.<br>
              Ne pas répondre à cet email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


# ── Email : création de compte ────────────────────
import secrets
from datetime import datetime, timedelta
 
# Ajouter une table de tokens (à ajouter dans models.py)
class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String(255), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
 
 
def send_account_created(
    to_email: str,
    full_name: str,
    role: str,
    login_url: str = "http://localhost:5173/login",
    db: Session = None,
) -> bool:
    """
    Envoie un email d'invitation avec lien sécurisé au lieu du mot de passe.
    """
    role_label = {
        "student": "Étudiant",
        "teacher": "Enseignant",
        "admin": "Administrateur",
    }.get(role, role)
 
    role_color = {
        "student": "#16a34a",
        "teacher": "#1d4ed8",
        "admin": "#991b1b",
    }.get(role, "#1e3a5f")
 
    # Générer un token unique et sécurisé
    setup_token = secrets.token_urlsafe(32)
    
    if db:
        # Créer le token d'activation
        user = db.query(User).filter_by(email=to_email).first()
        if user:
            reset_token = PasswordResetToken(
                user_id=user.id,
                token=setup_token,
                expires_at=datetime.utcnow() + timedelta(hours=24),
            )
            db.add(reset_token)
            db.commit()
    
    setup_link = f"{login_url}?setup_token={setup_token}"
 
    subject = f"Bienvenue sur UniLearn — Activez votre compte"
 
    body_html = f"""
      <h2 style="margin:0 0 8px;color:#1e3a5f;font-size:20px;">
        Bienvenue, {full_name} !
      </h2>
      <p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.6;">
        Votre compte a été créé sur la plateforme UniLearn.
      </p>
 
      <!-- Badge rôle -->
      <div style="margin-bottom:24px;">
        <span style="display:inline-block;background:{role_color};color:#fff;
                     font-size:12px;font-weight:700;padding:4px 14px;
                     border-radius:20px;letter-spacing:0.5px;">
          {role_label}
        </span>
      </div>
 
      <!-- Infos compte -->
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;
                  padding:20px 24px;margin-bottom:24px;">
        <p style="margin:0 0 12px;font-size:12px;font-weight:700;
                  color:#0369a1;text-transform:uppercase;letter-spacing:0.5px;">
          Votre Email
        </p>
        <p style="margin:0;font-size:14px;color:#0f172a;font-weight:700;">
          {to_email}
        </p>
      </div>
 
      <!-- Bouton activation -->
      <div style="text-align:center;margin-bottom:24px;">
        <a href="{setup_link}"
           style="display:inline-block;background:#1e3a5f;color:#ffffff;
                  text-decoration:none;font-size:15px;font-weight:700;
                  padding:14px 36px;border-radius:8px;letter-spacing:0.3px;">
          Définir mon mot de passe →
        </a>
      </div>
 
      <!-- Avertissement sécurité -->
      <div style="background:#fef9c3;border:1px solid #f59e0b;border-radius:8px;
                  padding:12px 16px;">
        <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
          ⏰ Ce lien expire dans 24 heures.<br>
          🔐 Ne partagez ce lien avec personne d'autre.
        </p>
      </div>
    """
 
    body_text = f"""Bienvenue sur UniLearn, {full_name}!
 
Votre compte a été créé. Activez-le en cliquant sur ce lien (valide 24h):
 
{setup_link}
 
Puis définissez un mot de passe sécurisé.
 
Ce message a été envoyé automatiquement. Ne pas répondre.
"""
 
    return _send(to_email, subject, _html_template(subject, body_html), body_text)


# ── Email : réinitialisation du mot de passe ──────
def send_password_reset(
    to_email:   str,
    full_name:  str,
    new_password: str,
    login_url:  str = "http://localhost:5173/login",
) -> bool:
    subject = "UniLearn — Votre mot de passe a été réinitialisé"

    body_html = f"""
      <h2 style="margin:0 0 8px;color:#1e3a5f;font-size:20px;">
        Réinitialisation de mot de passe
      </h2>
      <p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.6;">
        Bonjour <strong>{full_name}</strong>,<br>
        L'administrateur de la plateforme a réinitialisé votre mot de passe.
      </p>

      <!-- Nouveau mot de passe -->
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;
                  padding:20px 24px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;
                  color:#0369a1;text-transform:uppercase;letter-spacing:0.5px;">
          Nouveau mot de passe temporaire
        </p>
        <p style="margin:12px 0 0;font-size:24px;font-weight:700;
                  color:#1e3a5f;letter-spacing:3px;font-family:monospace;">
          {new_password}
        </p>
      </div>

      <div style="background:#fef9c3;border:1px solid #f59e0b;border-radius:8px;
                  padding:12px 16px;margin-bottom:24px;">
        <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
          ⚠️ <strong>Changez ce mot de passe immédiatement</strong> après connexion
          depuis la page <em>Mon profil → Changer le mot de passe</em>.
        </p>
      </div>

      <div style="text-align:center;">
        <a href="{login_url}"
           style="display:inline-block;background:#1e3a5f;color:#ffffff;
                  text-decoration:none;font-size:15px;font-weight:700;
                  padding:14px 36px;border-radius:8px;">
          Se connecter →
        </a>
      </div>
    """

    body_text = f"""Bonjour {full_name},

L'administrateur a réinitialisé votre mot de passe UniLearn.

Nouveau mot de passe : {new_password}

Connectez-vous sur : {login_url}
Puis changez votre mot de passe depuis Mon profil.

Ce message a été envoyé automatiquement. Ne pas répondre.
"""

    return _send(to_email, subject, _html_template(subject, body_html), body_text)
