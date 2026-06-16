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
