from django.contrib import admin

from .models import EmailVerification


@admin.register(EmailVerification)
class EmailVerificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'code', 'created_at', 'attempts')
    search_fields = ('user__email', 'user__username', 'code')
    readonly_fields = ('created_at',)
