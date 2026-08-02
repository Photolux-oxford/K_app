"""Shared outbound email — SMTP (with timeout) or Resend HTTP API."""
from __future__ import annotations

import logging

import requests
from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection

logger = logging.getLogger(__name__)


def send_app_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> bool:
    """
    Send an email. Returns True on success, False on failure (logged).

    Prefer Resend when RESEND_API_KEY is set (works on Railway when SMTP is blocked).
    Otherwise uses Django SMTP/console backends with a connection timeout.
    """
    if not to_email:
        return False

    from_email = settings.DEFAULT_FROM_EMAIL
    resend_key = getattr(settings, 'RESEND_API_KEY', '') or ''

    try:
        if resend_key:
            return _send_via_resend(
                api_key=resend_key,
                from_email=from_email,
                to_email=to_email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
            )
        return _send_via_django(
            from_email=from_email,
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
        )
    except Exception:
        logger.exception('Failed to send email to %s — subject: %s', to_email, subject)
        if settings.DEBUG:
            logger.info('Email text body:\n%s', text_body)
        return False


def _send_via_resend(
    *,
    api_key: str,
    from_email: str,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None,
) -> bool:
    payload: dict = {
        'from': from_email,
        'to': [to_email],
        'subject': subject,
        'text': text_body,
    }
    if html_body:
        payload['html'] = html_body

    resp = requests.post(
        'https://api.resend.com/emails',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
        json=payload,
        timeout=20,
    )
    if resp.status_code >= 400:
        logger.error('Resend error %s: %s', resp.status_code, resp.text)
        return False
    return True


def _send_via_django(
    *,
    from_email: str,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None,
) -> bool:
    timeout = getattr(settings, 'EMAIL_TIMEOUT', 20)
    connection = get_connection(timeout=timeout)
    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=from_email,
        to=[to_email],
        connection=connection,
    )
    if html_body:
        msg.attach_alternative(html_body, 'text/html')
    msg.send(fail_silently=False)
    return True
