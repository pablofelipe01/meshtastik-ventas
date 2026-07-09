"""
mailer.py — Envío de correos desde el gateway (para la herramienta @claude).

Resuelve destinatarios (alias de la libreta `email_contacts` en Supabase, o un
email completo) y envía por SMTP (p. ej. Fastmail). Se activa solo si hay
credenciales SMTP en el .env.

Config por .env:
  SMTP_HOST      (p. ej. smtp.fastmail.com)
  SMTP_PORT      (465 = SSL, 587 = STARTTLS)
  SMTP_USER      (usuario/correo de la cuenta)
  SMTP_PASSWORD  (app password de Fastmail)
  SMTP_FROM      (remitente; por defecto = SMTP_USER)
  SUPABASE_URL / SUPABASE_SERVICE_KEY  (para resolver alias de la libreta)
"""
import logging
import os
import smtplib
from email.message import EmailMessage
from urllib.parse import quote

import requests

log = logging.getLogger("mailer")

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "").strip() or SMTP_USER

_SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
_SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()

# El envío se activa solo con credenciales SMTP completas.
ENABLED = bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


def _resolve_alias(alias: str):
    """Busca un alias en la libreta (Supabase). Devuelve {email, name} o None."""
    if not (_SUPABASE_URL and _SUPABASE_KEY):
        return None
    try:
        r = requests.get(
            f"{_SUPABASE_URL}/rest/v1/email_contacts"
            f"?alias=ilike.{quote(alias)}&select=email,name&limit=1",
            headers={
                "apikey": _SUPABASE_KEY,
                "Authorization": f"Bearer {_SUPABASE_KEY}",
            },
            timeout=15,
        )
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None
    except Exception as e:
        log.error("✗ resolver alias '%s': %s", alias, e)
        return None


def list_contacts() -> list:
    """Devuelve la libreta de correos [{alias, name, email}] ordenada por alias.
    Para poblar el dropdown de la app (comando @correos)."""
    if not (_SUPABASE_URL and _SUPABASE_KEY):
        return []
    try:
        r = requests.get(
            f"{_SUPABASE_URL}/rest/v1/email_contacts"
            f"?select=alias,name,email&order=alias",
            headers={
                "apikey": _SUPABASE_KEY,
                "Authorization": f"Bearer {_SUPABASE_KEY}",
            },
            timeout=15,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.error("✗ listar libreta de correos: %s", e)
        return []


def send_email(destinatario: str, asunto: str, cuerpo: str) -> str:
    """Envía un correo. `destinatario` puede ser un email completo o un alias de
    la libreta. Devuelve un mensaje legible del resultado (para Claude/el nodo)."""
    if not ENABLED:
        return "El envío de correos no está configurado en el gateway."

    destinatario = (destinatario or "").strip()
    if not destinatario:
        return "Falta el destinatario del correo."

    if "@" in destinatario:
        to_email, to_name = destinatario, None
    else:
        row = _resolve_alias(destinatario)
        if not row:
            return (f"No encontré a '{destinatario}' en la libreta de correos. "
                    f"Usa un email completo o pide al administrador agregarlo.")
        to_email, to_name = row["email"], row.get("name")

    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg["Subject"] = (asunto or "").strip() or "Mensaje desde la red mesh"
    msg.set_content(cuerpo or "")

    try:
        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=30) as s:
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as s:
                s.starttls()
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
        log.info("✉️  correo enviado a %s", to_email)
        return f"Correo enviado a {to_name or to_email}."
    except Exception as e:
        log.error("✗ enviar correo a %s: %s", to_email, e)
        return f"No se pudo enviar el correo: {e}"
