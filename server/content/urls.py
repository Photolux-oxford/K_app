from django.urls import path
from . import views
from . import portfolio_views

urlpatterns = [
    path('service-area/', views.service_area_detail),
    path('service-area/check/', views.service_area_check),
    path('service-area/addresses/', views.service_area_addresses),
    path('availability/', views.customer_availability),
    path('portfolio/', portfolio_views.portfolio_list),
    path('portfolio/categories/', portfolio_views.portfolio_categories_public),
    path('portfolio/hero/', portfolio_views.portfolio_hero_public),
    path('bookings/', views.create_booking),
    path('dashboard/', views.customer_dashboard),
    path('health/', views.health_check),
    path('editing-requests/',                views.create_editing_request),
    path('editing-requests/<int:pk>/files/', views.upload_editing_file),
    path('editing-requests/<int:pk>/checkout/', views.editing_request_checkout),

    # Message endpoints
    path('messages/threads/', views.message_threads),
    path('messages/', views.message_list),
    path('messages/send/', views.send_message),
    path('messages/read/', views.mark_thread_read),

    # Admin endpoints
    path('admin/stats/', views.admin_stats),
    path('admin/bookings/', views.admin_bookings_list),
    path('admin/bookings/<int:pk>/status/', views.admin_booking_status),
    path('admin/bookings/<int:pk>/send-payment/', views.admin_booking_send_payment),
    path('admin/bookings/<int:pk>/message/', views.admin_booking_message),
    path('admin/editing-requests/', views.admin_editing_list),
    path('admin/editing-requests/<int:pk>/status/', views.admin_editing_status),
    path('admin/editing-requests/<int:pk>/send-payment/', views.admin_editing_send_payment),
    path('admin/editing-requests/<int:pk>/message/', views.admin_editing_message),
    path('admin/availability/',          views.admin_availability_list),
    path('admin/availability/upsert/',   views.admin_availability_upsert),
    path('admin/availability/<int:pk>/', views.admin_availability_delete),
    path('admin/calendar/', views.admin_calendar_events),
    path('admin/calendar/<int:pk>/', views.admin_calendar_event_detail),

    # Portfolio admin
    path('admin/portfolio/categories/', portfolio_views.admin_portfolio_categories),
    path('admin/portfolio/categories/<int:pk>/', portfolio_views.admin_portfolio_category_detail),
    path('admin/portfolio/items/', portfolio_views.admin_portfolio_items),
    path('admin/portfolio/items/reorder/', portfolio_views.admin_portfolio_items_reorder),
    path('admin/portfolio/items/<int:pk>/', portfolio_views.admin_portfolio_item_detail),
    path('admin/portfolio/hero/', portfolio_views.admin_portfolio_hero),
    path('admin/portfolio/hero/<int:slot_number>/', portfolio_views.admin_portfolio_hero_slot),
]
