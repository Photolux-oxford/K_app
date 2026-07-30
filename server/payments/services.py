import logging
from decimal import Decimal

import stripe
from django.conf import settings
from django.utils import timezone

from content.models import Payment, BookingRequest, EditingRequest

logger = logging.getLogger(__name__)


def _stripe_configured():
    return bool(getattr(settings, 'STRIPE_SECRET_KEY', ''))


def create_checkout_for_booking(booking: BookingRequest) -> Payment | None:
    if booking.quoted_price is not None:
        amount = Decimal(str(booking.quoted_price))
    else:
        amount = Decimal(str(getattr(settings, 'BOOKING_DEFAULT_PRICE', '150.00')))
    return _create_checkout(
        amount=amount,
        description=f'Photography session — {booking.session_type}',
        customer_email=booking.customer.email,
        metadata={'type': 'booking', 'booking_id': str(booking.id)},
        booking=booking,
    )


def create_checkout_for_editing(editing: EditingRequest) -> Payment | None:
    if editing.quoted_price is None:
        return None
    return _create_checkout(
        amount=editing.quoted_price,
        description='Photo editing service',
        customer_email=editing.customer.email,
        metadata={'type': 'editing', 'editing_id': str(editing.id)},
        editing=editing,
    )


def _create_checkout(*, amount, description, customer_email, metadata, booking=None, editing=None):
    if booking:
        existing = Payment.objects.filter(booking=booking).first()
    else:
        existing = Payment.objects.filter(editing_request=editing).first()

    if existing and existing.status == 'paid':
        return existing

    amount = Decimal(str(amount))

    if existing and existing.status == 'pending':
        if existing.amount == amount and existing.payment_link_url:
            return existing
        payment = existing
        payment.amount = amount
        payment.payment_link_url = ''
        payment.stripe_checkout_session_id = ''
        payment.save()
    else:
        payment = Payment.objects.create(
            booking=booking,
            editing_request=editing,
            amount=amount,
            currency='GBP',
            status='pending',
        )

    if not _stripe_configured():
        payment.payment_link_url = f'{settings.FRONTEND_URL}/dashboard?payment=dev-{payment.id}'
        payment.stripe_checkout_session_id = f'dev_session_{payment.id}'
        payment.save()
        logger.warning('Stripe not configured — using dev payment link for payment %s', payment.id)
        return payment

    stripe.api_key = settings.STRIPE_SECRET_KEY
    session = stripe.checkout.Session.create(
        mode='payment',
        customer_email=customer_email,
        line_items=[{
            'price_data': {
                'currency': 'gbp',
                'unit_amount': int(amount * 100),
                'product_data': {'name': description},
            },
            'quantity': 1,
        }],
        metadata={**metadata, 'payment_id': str(payment.id)},
        success_url=f'{settings.FRONTEND_URL}/dashboard?payment=success',
        cancel_url=f'{settings.FRONTEND_URL}/dashboard?payment=cancelled',
    )
    payment.stripe_checkout_session_id = session.id
    payment.payment_link_url = session.url or ''
    payment.save()
    return payment


def handle_checkout_completed(session: dict):
    payment_id = session.get('metadata', {}).get('payment_id')
    if not payment_id:
        return
    try:
        payment = Payment.objects.get(pk=payment_id)
    except Payment.DoesNotExist:
        return

    payment.status = 'paid'
    payment.paid_at = timezone.now()
    payment.stripe_payment_intent_id = session.get('payment_intent')
    payment.save()

    if payment.booking_id:
        booking = payment.booking
        booking.status = 'confirmed'
        booking.save()
        if booking.slot_id:
            slot = booking.slot
            slot.is_booked = True
            slot.save()

    if payment.editing_request_id:
        editing = payment.editing_request
        if editing.status == 'confirmed':
            editing.status = 'confirmed'
            editing.save()
