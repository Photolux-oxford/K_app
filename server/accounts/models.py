import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


def generate_verification_code() -> str:
    """Six-digit numeric code (000000–999999)."""
    return f'{secrets.randbelow(1_000_000):06d}'


class EmailVerification(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='email_verification',
    )
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'email verification'
        verbose_name_plural = 'email verifications'

    def __str__(self) -> str:
        return f'Verification for {self.user.email}'

    @property
    def is_expired(self) -> bool:
        minutes = getattr(settings, 'EMAIL_VERIFICATION_MINUTES', 15)
        return timezone.now() > self.created_at + timedelta(minutes=minutes)

    def refresh_code(self) -> str:
        self.code = generate_verification_code()
        self.created_at = timezone.now()
        self.attempts = 0
        self.save(update_fields=['code', 'created_at', 'attempts'])
        return self.code
