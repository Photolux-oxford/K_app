import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def send_booking_confirmation_email(booking, payment_url: str):
    subject = 'Your booking request has been confirmed — payment required'
    body = (
        f"Hi {booking.customer.first_name or booking.customer.email},\n\n"
        f"Kay has confirmed your {booking.session_type} photography session.\n"
        f"Location: {booking.location} ({booking.postcode})\n"
    )
    if booking.phone:
        body += f"Phone: {booking.phone}\n"
    if booking.slot:
        body += f"Date: {booking.slot.date} ({booking.slot.block})\n"
    if booking.access_instructions:
        body += f"Access instructions: {booking.access_instructions}\n"
    body += f"\nPlease complete payment here:\n{payment_url}\n\n"
    body += "Thank you,\nKay Tubillla Photography\n"
    _send(booking.customer.email, subject, body)


def send_editing_payment_email(editing, payment_url: str):
    subject = 'Your editing request has been confirmed — payment required'
    body = (
        f"Hi {editing.customer.first_name or editing.customer.email},\n\n"
        f"Kay has confirmed your editing request.\n"
        f"Quoted price: £{editing.quoted_price}\n\n"
        f"Please complete payment here:\n{payment_url}\n\n"
        f"Thank you,\nKay Tubillla Photography\n"
    )
    _send(editing.customer.email, subject, body)


def _send(to_email: str, subject: str, body: str):
    if not to_email:
        return
    try:
        send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            [to_email],
            fail_silently=False,
        )
    except Exception:
        logger.exception('Failed to send email to %s — subject: %s', to_email, subject)
        if settings.DEBUG:
            logger.info('Email body:\n%s', body)
