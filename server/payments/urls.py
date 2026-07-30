from django.urls import path
from . import views

urlpatterns = [
    path('webhook/', views.stripe_webhook),
    path('dev-mark-paid/', views.dev_mark_paid),
]
