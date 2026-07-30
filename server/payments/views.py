import json
import logging

import stripe
from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .services import handle_checkout_completed

logger = logging.getLogger(__name__)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def stripe_webhook(request):
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE', '')

    if not getattr(settings, 'STRIPE_WEBHOOK_SECRET', ''):
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            return HttpResponse(status=400)
        if event.get('type') == 'checkout.session.completed':
            handle_checkout_completed(event.get('data', {}).get('object', {}))
        return HttpResponse(status=200)

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except (ValueError, stripe.error.SignatureVerificationError):
        return HttpResponse(status=400)

    if event['type'] == 'checkout.session.completed':
        handle_checkout_completed(event['data']['object'])

    return HttpResponse(status=200)


@api_view(['POST'])
@permission_classes([AllowAny])
def dev_mark_paid(request):
    """Mark a payment paid when Stripe is not configured (local dev / tests)."""
    if getattr(settings, 'STRIPE_SECRET_KEY', ''):
        return Response({'error': 'Not available.'}, status=404)
    from content.models import Payment
    payment_id = request.data.get('payment_id')
    try:
        payment = Payment.objects.get(pk=payment_id)
    except Payment.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)
    handle_checkout_completed({
        'metadata': {'payment_id': str(payment.id)},
        'payment_intent': f'dev_pi_{payment.id}',
    })
    return Response({'ok': True, 'status': 'paid'})
