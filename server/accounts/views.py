from django.conf import settings
from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .emails import send_verification_code_email
from .models import EmailVerification, generate_verification_code

MAX_VERIFY_ATTEMPTS = 5


def _tokens_for(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': {
            'id': user.id,
            'email': user.email,
            'first_name': user.first_name,
            'is_staff': user.is_staff,
        },
    }


def _issue_verification(user: User) -> EmailVerification:
    from django.utils import timezone

    code = generate_verification_code()
    verification, created = EmailVerification.objects.get_or_create(
        user=user,
        defaults={'code': code, 'attempts': 0},
    )
    if not created:
        verification.code = code
        verification.attempts = 0
        verification.created_at = timezone.now()
        verification.save(update_fields=['code', 'attempts', 'created_at'])
    return verification


def _send_code(user: User, verification: EmailVerification) -> bool:
    return send_verification_code_email(
        to_email=user.email,
        first_name=user.first_name,
        code=verification.code,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    email = request.data.get('email', '').strip().lower()
    password = request.data.get('password', '')
    first_name = request.data.get('first_name', '').strip()
    last_name = request.data.get('last_name', '').strip()

    if not email:
        return Response({'error': 'Email is required.'}, status=400)
    if not password:
        return Response({'error': 'Password is required.'}, status=400)
    if len(password) < 8:
        return Response({'error': 'Password must be at least 8 characters.'}, status=400)

    existing = User.objects.filter(username=email).first()
    if existing and existing.is_active:
        return Response({'error': 'An account with this email already exists.'}, status=400)

    if existing and not existing.is_active:
        # Allow re-registration attempt: update details and resend code
        existing.set_password(password)
        existing.first_name = first_name
        existing.last_name = last_name
        existing.email = email
        existing.save()
        user = existing
    else:
        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            is_active=False,
        )

    verification = _issue_verification(user)
    sent = _send_code(user, verification)

    payload = {
        'requires_verification': True,
        'email': user.email,
        'message': (
            'We sent a verification code to your email. Enter it to activate your account.'
            if sent
            else 'Account created, but we could not send the email. Use Resend code, or check server email settings.'
        ),
        'email_sent': sent,
    }
    # Local/Railway debugging when SMTP is broken — only when DEBUG=True
    if settings.DEBUG:
        payload['debug_code'] = verification.code

    return Response(payload, status=201)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_email(request):
    email = request.data.get('email', '').strip().lower()
    code = str(request.data.get('code', '')).strip()

    if not email or not code:
        return Response({'error': 'Email and verification code are required.'}, status=400)

    try:
        user = User.objects.get(username=email)
    except User.DoesNotExist:
        return Response({'error': 'Invalid email or code.'}, status=400)

    if user.is_active and not hasattr(user, 'email_verification'):
        return Response({'error': 'This account is already verified. Please log in.'}, status=400)

    try:
        verification = user.email_verification
    except EmailVerification.DoesNotExist:
        return Response({'error': 'No verification pending for this account. Please register again.'}, status=400)

    if verification.is_expired:
        return Response({'error': 'This code has expired. Request a new one.'}, status=400)

    if verification.attempts >= MAX_VERIFY_ATTEMPTS:
        return Response({'error': 'Too many attempts. Request a new code.'}, status=400)

    if verification.code != code:
        verification.attempts += 1
        verification.save(update_fields=['attempts'])
        remaining = MAX_VERIFY_ATTEMPTS - verification.attempts
        return Response(
            {'error': f'Incorrect code. {remaining} attempt(s) remaining.'},
            status=400,
        )

    user.is_active = True
    user.save(update_fields=['is_active'])
    verification.delete()

    return Response(_tokens_for(user), status=200)


@api_view(['POST'])
@permission_classes([AllowAny])
def resend_verification(request):
    email = request.data.get('email', '').strip().lower()
    if not email:
        return Response({'error': 'Email is required.'}, status=400)

    try:
        user = User.objects.get(username=email)
    except User.DoesNotExist:
        # Do not reveal whether the email exists
        return Response({
            'email': email,
            'email_sent': True,
            'message': 'If an unverified account exists for this email, a new code was sent.',
        })

    if user.is_active:
        return Response({'error': 'This account is already verified. Please log in.'}, status=400)

    verification = _issue_verification(user)
    sent = _send_code(user, verification)

    payload = {
        'email': user.email,
        'email_sent': sent,
        'message': (
            'A new verification code was sent.'
            if sent
            else 'Could not send email. Check server email settings (SMTP or RESEND_API_KEY).'
        ),
    }
    if settings.DEBUG:
        payload['debug_code'] = verification.code
    return Response(payload)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    return Response({
        'id': user.id,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'is_staff': user.is_staff,
    })
