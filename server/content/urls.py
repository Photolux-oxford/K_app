from django.urls import path
from . import views

urlpatterns = [
    path('service-area/', views.service_area_detail),
    path('service-area/check/', views.service_area_check),
    path('availability/', views.customer_availability),
    path('portfolio/', views.portfolio_list),

    # Admin endpoints
    path('admin/stats/', views.admin_stats),
    path('admin/bookings/', views.admin_bookings_list),
    path('admin/bookings/<int:pk>/status/', views.admin_booking_status),
    path('admin/bookings/<int:pk>/message/', views.admin_booking_message),
    path('admin/editing-requests/', views.admin_editing_list),
    path('admin/editing-requests/<int:pk>/status/', views.admin_editing_status),
    path('admin/editing-requests/<int:pk>/message/', views.admin_editing_message),
    path('admin/availability/',          views.admin_availability_list),
    path('admin/availability/upsert/',   views.admin_availability_upsert),
    path('admin/availability/<int:pk>/', views.admin_availability_delete),
]
