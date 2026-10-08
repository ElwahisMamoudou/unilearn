import os
import smtplib
import logging
import secrets
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from models import User, PasswordResetToken

logger = logging.getLogger("unilearn.email")

SMTP_HOST     = os.getenv("SMTP_HOST",     "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER",     "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM     = os.getenv("SMTP_FROM",     f"UniLearn <{SMTP_USER}>")
EMAIL_ENABLED = bool(SMTP_USER and SMTP_PASSWORD)
def _send(to: str, subject: str, html: str, text: str) -> bool:
    if not EMAIL_ENABLED:
        logger.warning(f"Email desactive. Destinataire : {to}")
        logger.info(f"[EMAIL SIMULE] A : {to} | Sujet : {subject}")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = SMTP_FROM
        msg["To"]      = to
        msg.attach(MIMEText(text, "plain", "utf-8"))
        msg.attach(MIMEText(html, "html",  "utf-8"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, to, msg.as_string())
        logger.info(f"Email envoye -> {to} | {subject}")
        return True
    except Exception as e:
        logger.error(f"Echec envoi -> {to} : {e}")
        return False


def _html_template(title: str, body_html: str) -> str:
    return (
        "<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'>"
        f"<title>{title}</title></head>"
        "<body style='margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;'>"
        "<table width='100%' cellpadding='0' cellspacing='0'>"
        "<tr><td align='center' style='padding:32px 16px;'>"
        "<table width='560' cellpadding='0' cellspacing='0' "
        "style='background:#fff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.08);'>"
        "<tr><td style='background:#1e3a5f;padding:24px 32px;'>"
        "<h1 style='margin:0;color:#fff;font-size:22px;'>UniLearn</h1>"
        "<p style='margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:13px;'>Universite de Ngaoundere</p>"
        "</td></tr>"
        f"<tr><td style='padding:32px;'>{body_html}</td></tr>"
        "<tr><td style='background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;'>"
        "<p style='margin:0;font-size:12px;color:#94a3b8;text-align:center;'>"
        "Message automatique UniLearn. Ne pas repondre.</p>"
        "</td></tr></table></td></tr></table></body></html>"
    )


def send_account_created(
    to_email: str,
    full_name: str,
    role: str,
    login_url: str = "http://localhost:5173/login",
    db: Session = None,
) -> bool:
    role_label = {"student": "Etudiant", "teacher": "Enseignant", "admin": "Administrateur"}.get(role, role)
    role_color = {"student": "#16a34a", "teacher": "#1d4ed8", "admin": "#991b1b"}.get(role, "#1e3a5f")

    setup_token = secrets.token_urlsafe(32)
    if db:
        user = db.query(User).filter_by(email=to_email).first()
        if user:
            db.add(PasswordResetToken(
                user_id=user.id,
                token=setup_token,
                expires_at=datetime.utcnow() + timedelta(hours=24),
            ))
            db.commit()

    setup_link = f"{login_url}?setup_token={setup_token}"
    subject = "Bienvenue sur UniLearn - Activez votre compte"
    body_html = (
        f"<h2 style='margin:0 0 8px;color:#1e3a5f;'>Bienvenue, {full_name} !</h2>"
        "<p style='color:#64748b;font-size:14px;'>Votre compte a ete cree.</p>"
        f"<div style='margin-bottom:24px;'><span style='background:{role_color};color:#fff;"
        f"font-size:12px;font-weight:700;padding:4px 14px;border-radius:20px;'>{role_label}</span></div>"
        "<div style='background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:20px 24px;margin-bottom:24px;'>"
        "<p style='margin:0 0 4px;font-size:12px;font-weight:700;color:#0369a1;'>VOTRE EMAIL</p>"
        f"<p style='margin:0;font-size:14px;color:#0f172a;font-weight:700;'>{to_email}</p></div>"
        f"<div style='text-align:center;margin-bottom:24px;'><a href='{setup_link}' "
        "style='display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;"
        "font-size:15px;font-weight:700;padding:14px 36px;border-radius:8px;'>Definir mon mot de passe</a></div>"
        "<div style='background:#fef9c3;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;'>"
        "<p style='margin:0;font-size:13px;color:#92400e;'>Ce lien expire dans 24 heures.</p></div>"
    )
    body_text = f"Bienvenue {full_name}!\n\nActivez votre compte (24h):\n{setup_link}\n\nMessage automatique."
    return _send(to_email, subject, _html_template(subject, body_html), body_text)


def send_password_reset(
    to_email: str,
    full_name: str,
    new_password: str,
    login_url: str = "http://localhost:5173/login",
) -> bool:
    subject = "UniLearn - Mot de passe reinitialise"
    body_html = (
        "<h2 style='margin:0 0 8px;color:#1e3a5f;'>Reinitialisation de mot de passe</h2>"
        f"<p style='color:#64748b;font-size:14px;'>Bonjour <strong>{full_name}</strong>.</p>"
        "<div style='background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:20px 24px;margin-bottom:24px;'>"
        "<p style='margin:0 0 4px;font-size:12px;font-weight:700;color:#0369a1;'>MOT DE PASSE TEMPORAIRE</p>"
        f"<p style='margin:12px 0 0;font-size:24px;font-weight:700;color:#1e3a5f;"
        f"letter-spacing:3px;font-family:monospace;'>{new_password}</p></div>"
        "<div style='background:#fef9c3;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:24px;'>"
        "<p style='margin:0;font-size:13px;color:#92400e;'>Changez ce mot de passe immediatement.</p></div>"
        f"<div style='text-align:center;'><a href='{login_url}' "
        "style='display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;"
        "font-size:15px;font-weight:700;padding:14px 36px;border-radius:8px;'>Se connecter</a></div>"
    )
    body_text = f"Bonjour {full_name},\n\nMot de passe temporaire : {new_password}\n\nConnexion : {login_url}\n\nMessage automatique."
    return _send(to_email, subject, _html_template(subject, body_html), body_text)
