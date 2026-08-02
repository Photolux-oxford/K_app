import os
import urllib.parse
import json
import datetime as dt
import logging

import requests
from rest_framework.decorators import api_view, permission_classes
from django.db import transaction
from django.db.models import Max
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .models import (
    AdminCalendarEvent, AvailabilitySlot, BookingRequest, EditingFile,
    EditingRequest, Message, PortfolioItem, ServiceArea, Payment,
)

logger = logging.getLogger(__name__)

UPLOAD_MAX_SIZE = 25 * 1024 * 1024  # 25 MB


def _customer_display_name(user):
    """Full name when available, otherwise email."""
    full = f'{user.first_name} {user.last_name}'.strip()
    return full or user.email
UPLOAD_ALLOWED_EXTS = {'.jpg', '.jpeg', '.png', '.tiff', '.tif', '.cr2', '.nef', '.arw'}


def _point_in_polygon(lat, lng, polygon):
    """
    Ray-casting algorithm. polygon is a list of {"lat": float, "lng": float} dicts.
    Returns True if the point (lat, lng) is inside the polygon.
    """
    n = len(polygon)
    if n < 3:
        return False
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]['lng'], polygon[i]['lat']
        xj, yj = polygon[j]['lng'], polygon[j]['lat']
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _geocode_postcode(postcode):
    """
    Geocode a UK postcode using the free postcodes.io API.
    Returns (lat, lng, result_dict) or raises ValueError if the postcode is invalid.
    Raises requests.RequestException if the service is unreachable.
    """
    clean = postcode.replace(' ', '').upper()
    url = f"https://api.postcodes.io/postcodes/{clean}"
    resp = requests.get(url, timeout=8)
    if resp.status_code == 404:
        raise ValueError(f"Invalid or unknown postcode: {postcode}")
    resp.raise_for_status()
    data = resp.json()
    if data.get('status') != 200 or not data.get('result'):
        raise ValueError(f"Invalid or unknown postcode: {postcode}")
    result = data['result']
    return result['latitude'], result['longitude'], result


def _place_suggestions_from_postcode_result(result, postcode):
    """Build soft place-level suggestions when street-level lookup is unavailable."""
    suggestions = []
    postcode_fmt = result.get('postcode') or postcode
    ward = (result.get('admin_ward') or '').strip()
    district = (result.get('admin_district') or '').strip()
    parish = (result.get('parish') or '').strip()
    if parish.lower().endswith(', unparished area'):
        parish = ''

    if ward and district:
        suggestions.append({
            'line_1': ward,
            'line_2': '',
            'town': district,
            'formatted': f'{ward}, {district}, {postcode_fmt}',
            'id': '',
        })
    if district and not any(s['town'] == district and not s['line_1'] for s in suggestions):
        suggestions.append({
            'line_1': district,
            'line_2': '',
            'town': district,
            'formatted': f'{district}, {postcode_fmt}',
            'id': '',
        })
    if parish and parish != district:
        suggestions.append({
            'line_1': parish,
            'line_2': '',
            'town': district or parish,
            'formatted': f'{parish}, {postcode_fmt}',
            'id': '',
        })
    return suggestions


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticatedOrReadOnly])
def service_area_detail(request):
    area = ServiceArea.get()

    def payload():
        return {
            'polygon': area.polygon,
            'studio_name': area.studio_name,
            'studio_address': area.studio_address,
            'studio_lat': area.studio_lat,
            'studio_lng': area.studio_lng,
            'updated_at': area.updated_at,
        }

    if request.method == 'GET':
        return Response(payload())

    # PATCH — staff only
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'error': 'Staff access required.'}, status=403)

    if 'polygon' in request.data:
        polygon = request.data.get('polygon')
        if not isinstance(polygon, list):
            return Response({'error': 'polygon must be a list of {lat, lng} objects.'}, status=400)
        area.polygon = polygon

    if 'studio_name' in request.data:
        area.studio_name = str(request.data.get('studio_name') or '').strip()[:200]
    if 'studio_address' in request.data:
        area.studio_address = str(request.data.get('studio_address') or '').strip()
    if 'studio_lat' in request.data:
        raw = request.data.get('studio_lat')
        if raw is None or raw == '':
            area.studio_lat = None
        else:
            try:
                area.studio_lat = float(raw)
            except (TypeError, ValueError):
                return Response({'error': 'studio_lat must be a number.'}, status=400)
    if 'studio_lng' in request.data:
        raw = request.data.get('studio_lng')
        if raw is None or raw == '':
            area.studio_lng = None
        else:
            try:
                area.studio_lng = float(raw)
            except (TypeError, ValueError):
                return Response({'error': 'studio_lng must be a number.'}, status=400)

    area.save()
    return Response(payload())


@api_view(['POST'])
@permission_classes([AllowAny])
def service_area_check(request):
    postcode = request.data.get('postcode', '').strip()
    if not postcode:
        return Response({'error': 'postcode is required.'}, status=400)

    try:
        lat, lng, _result = _geocode_postcode(postcode)
    except ValueError as e:
        return Response({'error': str(e)}, status=400)
    except Exception:
        logger.exception('Postcode geocode failed for %s', postcode)
        return Response({'error': 'Postcode lookup service unavailable. Please try again.'}, status=503)

    area = ServiceArea.get()
    polygon = area.polygon if isinstance(area.polygon, list) else []
    is_within = _point_in_polygon(lat, lng, polygon) if polygon else False

    return Response({
        'postcode': postcode,
        'lat': lat,
        'lng': lng,
        'is_within_zone': is_within,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def service_area_addresses(request):
    """
    Look up addresses for a UK postcode.
    Prefers getAddress.io Autocomplete; falls back to place-level hints from postcodes.io
    when getAddress is unavailable (common for some new accounts that reject Autocomplete).
    """
    from django.conf import settings

    postcode = request.query_params.get('postcode', '').strip()
    if not postcode:
        return Response({'error': 'postcode query param is required.'}, status=400)

    # Always geocode first — validates postcode and provides fallback suggestions.
    try:
        _lat, _lng, geo = _geocode_postcode(postcode)
    except ValueError as e:
        return Response({'error': str(e)}, status=400)
    except Exception:
        logger.exception('Postcode geocode failed during address lookup for %s', postcode)
        return Response({'error': 'Postcode lookup service unavailable. Please try again.'}, status=503)

    fallback = _place_suggestions_from_postcode_result(geo, postcode)
    api_key = (getattr(settings, 'GETADDRESS_API_KEY', '') or '').strip()
    if not api_key:
        return Response({
            'postcode': geo.get('postcode') or postcode,
            'addresses': fallback,
            'source': 'postcodes.io',
        })

    # Autocomplete with all=true returns every address for a postcode (1 lookup).
    # Domain tokens (dtoken_…) also work here; send Origin so domain-restricted tokens match.
    url = f'https://api.getAddress.io/autocomplete/{urllib.parse.quote(postcode)}'
    frontend = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    try:
        resp = requests.get(
            url,
            params={'api-key': api_key, 'all': 'true', 'top': '100'},
            headers={'Origin': frontend, 'Referer': frontend + '/'},
            timeout=10,
        )
        if resp.status_code == 401:
            logger.error(
                'getAddress.io Autocomplete returned 401 for this key '
                '(Usage/Get may still work). Falling back to place hints. '
                'Try rotating the API key or creating a Domain Token for localhost.'
            )
            return Response({
                'postcode': geo.get('postcode') or postcode,
                'addresses': fallback,
                'source': 'postcodes.io',
                'warning': (
                    'Street-level lookup is not enabled for this getAddress key. '
                    'Type your full address below, or create a Domain Token in getAddress '
                    'for localhost and put that token in GETADDRESS_API_KEY.'
                ),
            })
        if resp.status_code != 200:
            logger.warning('getAddress.io returned %s for %s: %s', resp.status_code, postcode, resp.text[:200])
            return Response({
                'postcode': geo.get('postcode') or postcode,
                'addresses': fallback,
                'source': 'postcodes.io',
            })
        data = resp.json()
    except Exception:
        logger.exception('getAddress.io lookup failed for %s', postcode)
        return Response({
            'postcode': geo.get('postcode') or postcode,
            'addresses': fallback,
            'source': 'postcodes.io',
        })

    addresses = []
    for item in data.get('suggestions') or []:
        formatted = (item.get('address') or '').strip()
        if not formatted:
            continue
        addresses.append({
            'line_1': formatted.split(',')[0].strip() if formatted else '',
            'line_2': '',
            'town': '',
            'formatted': formatted,
            'id': item.get('id') or '',
        })

    if not addresses:
        addresses = fallback

    return Response({
        'postcode': geo.get('postcode') or postcode,
        'addresses': addresses,
        'source': 'getaddress.io' if addresses and addresses != fallback else 'postcodes.io',
    })


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_stats(request):
    from django.db.models import Q
    pending_bookings = BookingRequest.objects.filter(status='pending').count()
    active_editing = EditingRequest.objects.filter(
        status__in=['requested', 'confirmed', 'in_progress']
    ).count()
    portfolio_items = PortfolioItem.objects.count()

    recent_bookings = []
    for b in BookingRequest.objects.select_related('customer').order_by('-created_at')[:5]:
        recent_bookings.append({
            'id': b.id,
            'customer_email': b.customer.email,
            'customer_name': _customer_display_name(b.customer),
            'session_type': b.session_type,
            'status': b.status,
            'created_at': b.created_at.isoformat(),
        })

    recent_editing = []
    for e in EditingRequest.objects.select_related('customer').order_by('-created_at')[:5]:
        recent_editing.append({
            'id': e.id,
            'customer_email': e.customer.email,
            'customer_name': _customer_display_name(e.customer),
            'turnaround': e.turnaround,
            'status': e.status,
            'created_at': e.created_at.isoformat(),
        })

    return Response({
        'pending_bookings': pending_bookings,
        'active_editing': active_editing,
        'portfolio_items': portfolio_items,
        'recent_bookings': recent_bookings,
        'recent_editing': recent_editing,
    })


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_bookings_list(request):
    status_filter = request.query_params.get('status')
    qs = BookingRequest.objects.select_related('customer', 'slot').order_by('-created_at')
    if status_filter:
        qs = qs.filter(status=status_filter)

    items = []
    for b in qs:
        payment = Payment.objects.filter(booking=b).first()
        items.append({
            'id': b.id,
            'customer_email': b.customer.email,
            'customer_name': _customer_display_name(b.customer),
            'session_type': b.session_type,
            'location': b.location,
            'address_line_1': b.address_line_1 or b.location,
            'address_line_2': b.address_line_2,
            'postcode': b.postcode,
            'phone': b.phone,
            'date': b.slot.date.isoformat() if b.slot else None,
            'preferred_schedule': b.preferred_schedule or '',
            'status': b.status,
            'notes': b.notes,
            'access_instructions': b.access_instructions,
            'is_home_visit': b.is_home_visit,
            'quoted_price': str(b.quoted_price) if b.quoted_price is not None else None,
            'payment': _payment_summary(payment),
            'created_at': b.created_at.isoformat(),
        })
    return Response(items)


@api_view(['PATCH'])
@permission_classes([IsAdminUser])
def admin_booking_status(request, pk):
    try:
        booking = BookingRequest.objects.get(pk=pk)
    except BookingRequest.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    new_status = request.data.get('status')
    valid = [s[0] for s in BookingRequest.STATUS_CHOICES]
    if new_status not in valid:
        return Response({'error': f'Invalid status. Must be one of: {valid}'}, status=400)

    old_status = booking.status
    booking.status = new_status
    booking.save()

    if new_status in ('cancelled', 'declined') and booking.slot_id:
        slot = booking.slot
        slot.is_booked = False
        slot.save()

    return Response({'id': booking.id, 'status': booking.status})


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_booking_send_payment(request, pk):
    try:
        booking = BookingRequest.objects.get(pk=pk)
    except BookingRequest.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    if booking.status in ('declined', 'cancelled', 'completed'):
        return Response({'error': 'Cannot send payment for this booking status.'}, status=400)

    existing_payment = Payment.objects.filter(booking=booking).first()
    if existing_payment and existing_payment.status == 'paid':
        return Response({'error': 'Payment already completed.'}, status=400)

    price = request.data.get('quoted_price')
    if price is None or price == '':
        return Response({'error': 'quoted_price is required.'}, status=400)
    try:
        price_value = float(price)
        if price_value <= 0:
            raise ValueError('non-positive')
    except (ValueError, TypeError):
        return Response({'error': 'quoted_price must be a positive number.'}, status=400)

    booking.quoted_price = price_value
    booking.status = 'confirmed'
    booking.save()

    from payments.services import create_checkout_for_booking
    from content.emails import send_booking_confirmation_email

    payment = create_checkout_for_booking(booking)
    if not payment:
        return Response({'error': 'Could not create payment.'}, status=500)

    if payment.payment_link_url:
        send_booking_confirmation_email(booking, payment.payment_link_url)

    Message.objects.create(
        thread_type='booking',
        thread_id=booking.id,
        sender=request.user,
        body=(
            f'Your quote is ready: £{booking.quoted_price:.2f}. '
            f'Please head to your Bookings page and click the Pay button to complete payment.'
        ),
    )

    return Response({
        'id': booking.id,
        'quoted_price': str(booking.quoted_price),
        'status': booking.status,
        'payment': _payment_summary(payment),
    })


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_booking_message(request, pk):
    try:
        booking = BookingRequest.objects.get(pk=pk)
    except BookingRequest.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    body = request.data.get('body', '').strip()
    if not body:
        return Response({'error': 'body is required.'}, status=400)

    msg = Message.objects.create(
        thread_type='booking',
        thread_id=booking.id,
        sender=request.user,
        body=body,
    )
    return Response({'id': msg.id, 'body': msg.body, 'timestamp': msg.timestamp.isoformat()}, status=201)


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_editing_list(request):
    status_filter = request.query_params.get('status')
    qs = EditingRequest.objects.select_related('customer').prefetch_related('files').order_by('-created_at')
    if status_filter:
        qs = qs.filter(status=status_filter)

    items = []
    for e in qs:
        payment = Payment.objects.filter(editing_request=e).first()
        items.append({
            'id': e.id,
            'customer_email': e.customer.email,
            'customer_name': _customer_display_name(e.customer),
            'style_notes': e.style_notes,
            'turnaround': e.turnaround,
            'package': e.package or None,
            'status': e.status,
            'quoted_price': str(e.quoted_price) if e.quoted_price is not None else None,
            'file_count': e.files.count(),
            'created_at': e.created_at.isoformat(),
            'payment': _payment_summary(payment),
        })
    return Response(items)


@api_view(['PATCH'])
@permission_classes([IsAdminUser])
def admin_editing_status(request, pk):
    try:
        editing = EditingRequest.objects.get(pk=pk)
    except EditingRequest.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    if 'status' in request.data:
        new_status = request.data['status']
        valid = [s[0] for s in EditingRequest.STATUS_CHOICES]
        if new_status not in valid:
            return Response({'error': f'Invalid status. Must be one of: {valid}'}, status=400)
        editing.status = new_status

    if 'quoted_price' in request.data:
        price = request.data['quoted_price']
        if price is not None and price != '':
            try:
                editing.quoted_price = float(price)
            except (ValueError, TypeError):
                return Response({'error': 'quoted_price must be a number.'}, status=400)
        else:
            editing.quoted_price = None

    editing.save()

    return Response({
        'id': editing.id,
        'status': editing.status,
        'quoted_price': str(editing.quoted_price) if editing.quoted_price is not None else None,
    })


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_editing_send_payment(request, pk):
    try:
        editing = EditingRequest.objects.get(pk=pk)
    except EditingRequest.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    if editing.status in ('declined', 'delivered'):
        return Response({'error': 'Cannot send payment for this job status.'}, status=400)

    existing_payment = Payment.objects.filter(editing_request=editing).first()
    if existing_payment and existing_payment.status == 'paid':
        return Response({'error': 'Payment already completed.'}, status=400)

    price = request.data.get('quoted_price')
    if price is None or price == '':
        return Response({'error': 'quoted_price is required.'}, status=400)
    try:
        price_value = float(price)
        if price_value <= 0:
            raise ValueError('non-positive')
    except (ValueError, TypeError):
        return Response({'error': 'quoted_price must be a positive number.'}, status=400)

    editing.quoted_price = price_value
    editing.status = 'confirmed'
    editing.save()

    from payments.services import create_checkout_for_editing
    from content.emails import send_editing_payment_email

    payment = create_checkout_for_editing(editing)
    if not payment:
        return Response({'error': 'Could not create payment.'}, status=500)

    if payment.payment_link_url:
        send_editing_payment_email(editing, payment.payment_link_url)

    Message.objects.create(
        thread_type='editing',
        thread_id=editing.id,
        sender=request.user,
        body=f'Payment request sent: £{editing.quoted_price}. You can pay from your dashboard.',
    )

    return Response({
        'id': editing.id,
        'quoted_price': str(editing.quoted_price),
        'status': editing.status,
        'payment': _payment_summary(payment),
    })


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_editing_message(request, pk):
    try:
        editing = EditingRequest.objects.get(pk=pk)
    except EditingRequest.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    body = request.data.get('body', '').strip()
    if not body:
        return Response({'error': 'body is required.'}, status=400)

    msg = Message.objects.create(
        thread_type='editing',
        thread_id=editing.id,
        sender=request.user,
        body=body,
    )
    return Response({'id': msg.id, 'body': msg.body, 'timestamp': msg.timestamp.isoformat()}, status=201)


@api_view(['GET', 'POST'])
@permission_classes([IsAdminUser])
def admin_calendar_events(request):
    """Personal organisation calendar for Kay — not linked to customer bookings."""
    if request.method == 'GET':
        month = request.query_params.get('month')
        qs = AdminCalendarEvent.objects.all()
        if month:
            try:
                year, mon = month.split('-')
                year, mon = int(year), int(mon)
            except (ValueError, AttributeError):
                return Response({'error': 'month must be YYYY-MM'}, status=400)
            qs = qs.filter(date__year=year, date__month=mon)
        return Response([_calendar_event_payload(e) for e in qs])

    title = request.data.get('title', '').strip()
    date_str = request.data.get('date', '').strip()
    notes = request.data.get('notes', '').strip()
    start_time = request.data.get('start_time') or None
    end_time = request.data.get('end_time') or None

    if not title or not date_str:
        return Response({'error': 'title and date are required.'}, status=400)
    if len(title) > 200:
        return Response({'error': 'title must be 200 characters or fewer.'}, status=400)
    if len(notes) > 2000:
        return Response({'error': 'notes must be 2000 characters or fewer.'}, status=400)

    try:
        date_obj = dt.date.fromisoformat(date_str)
    except ValueError:
        return Response({'error': 'date must be YYYY-MM-DD.'}, status=400)

    try:
        start_obj = dt.time.fromisoformat(start_time) if start_time else None
        end_obj = dt.time.fromisoformat(end_time) if end_time else None
    except ValueError:
        return Response({'error': 'start_time and end_time must be HH:MM or HH:MM:SS.'}, status=400)

    event = AdminCalendarEvent.objects.create(
        title=title,
        date=date_obj,
        start_time=start_obj,
        end_time=end_obj,
        notes=notes,
    )
    return Response(_calendar_event_payload(event), status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAdminUser])
def admin_calendar_event_detail(request, pk):
    try:
        event = AdminCalendarEvent.objects.get(pk=pk)
    except AdminCalendarEvent.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    if request.method == 'DELETE':
        event.delete()
        return Response(status=204)

    if 'title' in request.data:
        title = str(request.data.get('title', '')).strip()
        if not title:
            return Response({'error': 'title cannot be empty.'}, status=400)
        if len(title) > 200:
            return Response({'error': 'title must be 200 characters or fewer.'}, status=400)
        event.title = title

    if 'date' in request.data:
        try:
            event.date = dt.date.fromisoformat(str(request.data.get('date', '')).strip())
        except ValueError:
            return Response({'error': 'date must be YYYY-MM-DD.'}, status=400)

    if 'notes' in request.data:
        notes = str(request.data.get('notes', '')).strip()
        if len(notes) > 2000:
            return Response({'error': 'notes must be 2000 characters or fewer.'}, status=400)
        event.notes = notes

    if 'start_time' in request.data:
        raw = request.data.get('start_time')
        if raw in (None, ''):
            event.start_time = None
        else:
            try:
                event.start_time = dt.time.fromisoformat(str(raw))
            except ValueError:
                return Response({'error': 'start_time must be HH:MM or HH:MM:SS.'}, status=400)

    if 'end_time' in request.data:
        raw = request.data.get('end_time')
        if raw in (None, ''):
            event.end_time = None
        else:
            try:
                event.end_time = dt.time.fromisoformat(str(raw))
            except ValueError:
                return Response({'error': 'end_time must be HH:MM or HH:MM:SS.'}, status=400)

    event.save()
    return Response(_calendar_event_payload(event))


def _calendar_event_payload(event: AdminCalendarEvent):
    return {
        'id': event.id,
        'title': event.title,
        'date': event.date.isoformat(),
        'start_time': event.start_time.strftime('%H:%M') if event.start_time else None,
        'end_time': event.end_time.strftime('%H:%M') if event.end_time else None,
        'notes': event.notes,
        'created_at': event.created_at.isoformat(),
        'updated_at': event.updated_at.isoformat(),
    }


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_availability_list(request):
    """Deprecated: availability calendar removed. Use /admin/calendar/."""
    return Response({'error': 'Availability calendar has been replaced by the personal calendar.'}, status=410)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_availability_upsert(request):
    return Response({'error': 'Availability calendar has been replaced by the personal calendar.'}, status=410)


@api_view(['DELETE'])
@permission_classes([IsAdminUser])
def admin_availability_delete(request, pk):
    return Response({'error': 'Availability calendar has been replaced by the personal calendar.'}, status=410)


@api_view(['GET'])
@permission_classes([AllowAny])
def customer_availability(request):
    return Response(
        {'error': 'Public availability calendar has been removed. Request a session and discuss timing via Messages.'},
        status=410,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_booking(request):
    session_type = request.data.get('session_type', '').strip()
    phone = request.data.get('phone', '').strip()
    notes = request.data.get('notes', '').strip()
    preferred_schedule = request.data.get('preferred_schedule', '').strip()

    if not session_type:
        return Response({'error': 'session_type is required.'}, status=400)
    if not phone:
        return Response({'error': 'phone is required.'}, status=400)
    if len(phone) > 30:
        return Response({'error': 'phone must be 30 characters or fewer.'}, status=400)
    if len(preferred_schedule) > 1000:
        return Response({'error': 'preferred_schedule must be 1000 characters or fewer.'}, status=400)

    valid_types = [s[0] for s in BookingRequest.SESSION_TYPES]
    if session_type not in valid_types:
        return Response({'error': f'session_type must be one of {valid_types}.'}, status=400)

    area = ServiceArea.get()
    location = area.studio_location_label()
    postcode = ''

    booking = BookingRequest.objects.create(
        customer=request.user,
        session_type=session_type,
        location=location,
        address_line_1=location,
        address_line_2='',
        postcode=postcode,
        phone=phone,
        is_home_visit=False,
        notes=notes,
        access_instructions='',
        preferred_schedule=preferred_schedule,
        status='pending',
    )

    schedule_bit = f' Preferred timing: {preferred_schedule}.' if preferred_schedule else ''
    Message.objects.create(
        thread_type='booking',
        thread_id=booking.id,
        sender=request.user,
        body=(
            f'New booking request: {session_type} · Studio session ({location}).'
            + schedule_bit
            + (f' Notes: {notes}' if notes else '')
        ),
    )

    return Response({'id': booking.id, 'status': booking.status}, status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_editing_request(request):
    from content.editing_packages import EDITING_PACKAGES, EDITING_TURNAROUND

    style_notes = request.data.get('style_notes', '').strip()
    package = request.data.get('package', '').strip()

    if not style_notes:
        return Response({'error': 'style_notes is required.'}, status=400)
    if package not in EDITING_PACKAGES:
        return Response(
            {'error': f'package is required. Must be one of: {list(EDITING_PACKAGES)}'},
            status=400,
        )
    if len(style_notes) > 2000:
        return Response({'error': 'style_notes must be 2000 characters or fewer.'}, status=400)

    meta = EDITING_PACKAGES[package]
    editing = EditingRequest.objects.create(
        customer=request.user,
        style_notes=style_notes,
        turnaround=EDITING_TURNAROUND,
        package=package,
        quoted_price=meta['price'],
    )
    return Response({
        'id': editing.id,
        'status': editing.status,
        'package': editing.package,
        'quoted_price': str(editing.quoted_price),
    }, status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def editing_request_checkout(request, pk):
    """Finalize an editing request: validate photo count against package and create Stripe checkout."""
    from content.editing_packages import EDITING_PACKAGES, validate_package_count
    from payments.services import create_checkout_for_editing
    from content.emails import send_editing_payment_email

    try:
        editing = EditingRequest.objects.get(pk=pk, customer=request.user)
    except EditingRequest.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    if not editing.package or editing.package not in EDITING_PACKAGES:
        return Response({'error': 'Editing request has no valid package.'}, status=400)

    existing = Payment.objects.filter(editing_request=editing).first()
    if existing and existing.status == 'paid':
        return Response({'error': 'Payment already completed.'}, status=400)

    file_count = editing.files.count()
    err = validate_package_count(editing.package, file_count)
    if err:
        return Response({'error': err}, status=400)

    meta = EDITING_PACKAGES[editing.package]
    editing.quoted_price = meta['price']
    editing.status = 'confirmed'
    editing.save()

    payment = create_checkout_for_editing(editing)
    if not payment:
        return Response({'error': 'Could not create payment.'}, status=500)

    if payment.payment_link_url:
        send_editing_payment_email(editing, payment.payment_link_url)

    Message.objects.create(
        thread_type='editing',
        thread_id=editing.id,
        sender=request.user,
        body=(
            f'Editing package "{meta["label"]}" ({file_count} photos) — '
            f'£{editing.quoted_price}. Payment link ready on your dashboard.'
        ),
    )

    return Response({
        'id': editing.id,
        'status': editing.status,
        'package': editing.package,
        'quoted_price': str(editing.quoted_price),
        'payment': _payment_summary(payment),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_editing_file(request, pk):
    try:
        editing = EditingRequest.objects.get(pk=pk, customer=request.user)
    except EditingRequest.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'file is required.'}, status=400)

    from content.editing_packages import EDITING_PACKAGES
    max_files = 20
    if editing.package in EDITING_PACKAGES:
        max_files = EDITING_PACKAGES[editing.package]['max_photos']
    if EditingFile.objects.filter(editing_request=editing).count() >= max_files:
        return Response({'error': f'Maximum {max_files} files for this package.'}, status=400)

    if file.size > UPLOAD_MAX_SIZE:
        return Response({'error': 'File exceeds 25 MB limit.'}, status=400)

    ext = os.path.splitext(file.name)[1].lower()
    if ext not in UPLOAD_ALLOWED_EXTS:
        return Response(
            {'error': f'File type not allowed. Accepted: {", ".join(sorted(UPLOAD_ALLOWED_EXTS))}'},
            status=400
        )

    editing_file = EditingFile.objects.create(editing_request=editing, file=file)
    return Response({
        'id': editing_file.id,
        'file_name': os.path.basename(editing_file.file.name),
        'uploaded_at': editing_file.uploaded_at.isoformat(),
    }, status=201)


@api_view(['GET'])
@permission_classes([AllowAny])
def _thread_subject(thread_type, thread_id):
    """Derive a display subject for a thread without storing it."""
    if thread_type == 'editing':
        try:
            req = EditingRequest.objects.get(pk=thread_id)
            return req.style_notes[:60]
        except EditingRequest.DoesNotExist:
            return f'Editing #{thread_id}'
    else:
        try:
            req = BookingRequest.objects.get(pk=thread_id)
            return f"{req.session_type.capitalize()} · {req.location}"
        except BookingRequest.DoesNotExist:
            return f'Booking #{thread_id}'


def _system_message(thread_type, thread_id):
    """Return the auto-opener system message dict (not a stored Message row)."""
    if thread_type == 'editing':
        try:
            req = EditingRequest.objects.prefetch_related('files').get(pk=thread_id)
            file_count = req.files.count()
            body = (
                f"Editing Request #{req.id} — {req.style_notes}. "
                f"Turnaround: {req.turnaround}. {file_count} photo{'s' if file_count != 1 else ''} uploaded."
            )
        except EditingRequest.DoesNotExist:
            body = f"Editing Request #{thread_id}"
    else:
        try:
            req = BookingRequest.objects.get(pk=thread_id)
            schedule = req.preferred_schedule.strip() if req.preferred_schedule else ''
            if not schedule and req.slot:
                schedule = f'{req.slot.date.isoformat()} {req.slot.block}'
            schedule_bit = f' Preferred timing: {schedule}.' if schedule else ' Timing to be confirmed via Messages.'
            body = (
                f"Booking Request #{req.id} — {req.session_type.capitalize()} at "
                f"{req.location} ({req.postcode}).{schedule_bit}"
            )
        except BookingRequest.DoesNotExist:
            body = f"Booking Request #{thread_id}"
    return {
        'id': None,
        'is_system': True,
        'sender_email': None,
        'body': body,
        'timestamp': None,
        'is_own': False,
    }


def _user_owns_thread(user, thread_type, thread_id):
    """Return True if the user is the customer for this thread."""
    if thread_type == 'editing':
        return EditingRequest.objects.filter(pk=thread_id, customer=user).exists()
    else:
        return BookingRequest.objects.filter(pk=thread_id, customer=user).exists()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def message_threads(request):
    from django.db.models import Count, OuterRef, Subquery, TextField
    user = request.user

    if user.is_staff:
        last_body_subq = Message.objects.filter(
            thread_type=OuterRef('thread_type'),
            thread_id=OuterRef('thread_id'),
        ).order_by('-timestamp').values('body')[:1]

        thread_qs = list(
            Message.objects
            .values('thread_type', 'thread_id')
            .annotate(
                last_message_at=Max('timestamp'),
                last_message_body=Subquery(last_body_subq, output_field=TextField()),
            )
            .order_by('-last_message_at')
        )

        editing_ids = [r['thread_id'] for r in thread_qs if r['thread_type'] == 'editing']
        booking_ids = [r['thread_id'] for r in thread_qs if r['thread_type'] == 'booking']
        editing_map = {e.id: e for e in EditingRequest.objects.filter(pk__in=editing_ids).select_related('customer')}
        booking_map = {b.id: b for b in BookingRequest.objects.filter(pk__in=booking_ids).select_related('customer')}

        unread_rows = (
            Message.objects
            .filter(read_by_recipient=False)
            .exclude(sender=user)
            .values('thread_type', 'thread_id')
            .annotate(unread=Count('id'))
        )
        unread_map = {(r['thread_type'], r['thread_id']): r['unread'] for r in unread_rows}

        result = []
        for row in thread_qs:
            tt = row['thread_type']
            tid = row['thread_id']
            if tt == 'editing':
                req = editing_map.get(tid)
                customer_email = req.customer.email if req else 'unknown'
                customer_name = _customer_display_name(req.customer) if req else 'unknown'
                subject = req.style_notes[:60] if req else f'Editing #{tid}'
            else:
                req = booking_map.get(tid)
                customer_email = req.customer.email if req else 'unknown'
                customer_name = _customer_display_name(req.customer) if req else 'unknown'
                subject = f"{req.session_type.capitalize()} · {req.location}" if req else f'Booking #{tid}'
            result.append({
                'thread_type': tt,
                'thread_id': tid,
                'customer_email': customer_email,
                'customer_name': customer_name,
                'subject': subject,
                'last_message_body': row['last_message_body'] or '',
                'last_message_at': row['last_message_at'].isoformat() if row['last_message_at'] else None,
                'unread_count': unread_map.get((tt, tid), 0),
            })
        return Response(result)

    else:
        from django.db.models import Count, OuterRef, Subquery, TextField
        result = {'editing': [], 'booking': []}
        for tt in ('editing', 'booking'):
            if tt == 'editing':
                owned = {e.id: e for e in EditingRequest.objects.filter(customer=user)}
            else:
                owned = {b.id: b for b in BookingRequest.objects.filter(customer=user)}

            owned_ids = list(owned.keys())
            if not owned_ids:
                continue

            thread_qs = list(
                Message.objects
                .filter(thread_type=tt, thread_id__in=owned_ids)
                .values('thread_id')
                .annotate(
                    last_message_at=Max('timestamp'),
                    last_message_body=Subquery(
                        Message.objects.filter(
                            thread_type=tt,
                            thread_id=OuterRef('thread_id'),
                        ).order_by('-timestamp').values('body')[:1],
                        output_field=TextField(),
                    ),
                )
                .order_by('-last_message_at')
            )

            unread_rows = (
                Message.objects
                .filter(thread_type=tt, thread_id__in=owned_ids, read_by_recipient=False)
                .exclude(sender=user)
                .values('thread_id')
                .annotate(unread=Count('id'))
            )
            unread_map = {r['thread_id']: r['unread'] for r in unread_rows}

            for row in thread_qs:
                tid = row['thread_id']
                req = owned.get(tid)
                if tt == 'editing':
                    subject = req.style_notes[:60] if req else f'Editing #{tid}'
                else:
                    subject = f"{req.session_type.capitalize()} · {req.location}" if req else f'Booking #{tid}'
                result[tt].append({
                    'thread_id': tid,
                    'subject': subject,
                    'last_message_body': row['last_message_body'] or '',
                    'last_message_at': row['last_message_at'].isoformat() if row['last_message_at'] else None,
                    'unread_count': unread_map.get(tid, 0),
                })
        return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def message_list(request):
    thread_type = request.query_params.get('thread_type', '')
    thread_id = request.query_params.get('thread_id', '')

    if thread_type not in ('booking', 'editing') or not thread_id:
        return Response({'error': 'thread_type and thread_id are required.'}, status=400)

    try:
        thread_id = int(thread_id)
    except ValueError:
        return Response({'error': 'thread_id must be an integer.'}, status=400)

    # Access control: customers can only read their own thread
    if not request.user.is_staff:
        if not _user_owns_thread(request.user, thread_type, thread_id):
            return Response({'error': 'Access denied.'}, status=403)

    messages = Message.objects.filter(thread_type=thread_type, thread_id=thread_id).select_related('sender')

    result = [_system_message(thread_type, thread_id)]
    for m in messages:
        result.append({
            'id': m.id,
            'is_system': False,
            'sender_email': m.sender.email,
            'body': m.body,
            'timestamp': m.timestamp.isoformat(),
            'is_own': m.sender_id == request.user.id,
        })
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_message(request):
    thread_type = request.data.get('thread_type', '')
    thread_id = request.data.get('thread_id')
    body = request.data.get('body', '').strip()

    if thread_type not in ('booking', 'editing'):
        return Response({'error': 'thread_type must be booking or editing.'}, status=400)
    if not thread_id:
        return Response({'error': 'thread_id is required.'}, status=400)
    if not body:
        return Response({'error': 'body is required.'}, status=400)
    if len(body) > 4000:
        return Response({'error': 'Message body must be 4000 characters or fewer.'}, status=400)

    try:
        thread_id = int(thread_id)
    except (ValueError, TypeError):
        return Response({'error': 'thread_id must be an integer.'}, status=400)

    # Verify thread exists (for both staff and customers)
    if thread_type == 'editing':
        if not EditingRequest.objects.filter(pk=thread_id).exists():
            return Response({'error': 'Thread not found.'}, status=404)
    else:
        if not BookingRequest.objects.filter(pk=thread_id).exists():
            return Response({'error': 'Thread not found.'}, status=404)

    if not request.user.is_staff:
        if not _user_owns_thread(request.user, thread_type, thread_id):
            return Response({'error': 'Access denied.'}, status=403)

    msg = Message.objects.create(
        thread_type=thread_type,
        thread_id=thread_id,
        sender=request.user,
        body=body,
    )
    return Response({
        'id': msg.id,
        'sender_email': msg.sender.email,
        'body': msg.body,
        'timestamp': msg.timestamp.isoformat(),
        'is_own': True,
    }, status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_thread_read(request):
    thread_type = request.data.get('thread_type', '')
    thread_id = request.data.get('thread_id')

    if thread_type not in ('booking', 'editing') or not thread_id:
        return Response({'error': 'thread_type and thread_id are required.'}, status=400)

    try:
        thread_id = int(thread_id)
    except (ValueError, TypeError):
        return Response({'error': 'thread_id must be an integer.'}, status=400)

    # Verify thread exists
    if thread_type == 'editing':
        if not EditingRequest.objects.filter(pk=thread_id).exists():
            return Response({'error': 'Thread not found.'}, status=404)
    else:
        if not BookingRequest.objects.filter(pk=thread_id).exists():
            return Response({'error': 'Thread not found.'}, status=404)

    if not request.user.is_staff:
        if not _user_owns_thread(request.user, thread_type, thread_id):
            return Response({'error': 'Access denied.'}, status=403)

    Message.objects.filter(
        thread_type=thread_type,
        thread_id=thread_id,
        read_by_recipient=False,
    ).exclude(sender=request.user).update(read_by_recipient=True)

    # Push updated badge count via Channels (fire-and-forget, don't fail if Redis is down)
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        if channel_layer:
            user = request.user
            if user.is_staff:
                from .consumers import _get_staff_unread_count
                count = async_to_sync(_get_staff_unread_count)()
                async_to_sync(channel_layer.group_send)(
                    'staff_notifications',
                    {'type': 'unread_count_update', 'count': count}
                )
            else:
                from .consumers import _get_unread_count
                count = async_to_sync(_get_unread_count)(user.id, is_staff=False)
                async_to_sync(channel_layer.group_send)(
                    f'user_{user.id}',
                    {'type': 'unread_count_update', 'count': count}
                )
    except Exception:
        pass  # Channel layer unavailable (e.g., Redis down) — badge will update on next WS frame

    return Response({'status': 'ok'})


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({'status': 'ok'})


def _payment_summary(payment):
    if not payment:
        return None
    return {
        'id': payment.id,
        'status': payment.status,
        'amount': str(payment.amount),
        'currency': payment.currency,
        'payment_link_url': payment.payment_link_url or None,
        'paid_at': payment.paid_at.isoformat() if payment.paid_at else None,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def customer_dashboard(request):
    bookings = BookingRequest.objects.filter(
        customer=request.user
    ).select_related('slot').order_by('-created_at')

    editing = EditingRequest.objects.filter(
        customer=request.user
    ).order_by('-created_at')

    booking_data = []
    for b in bookings:
        payment = Payment.objects.filter(booking=b).first()
        booking_data.append({
            'id': b.id,
            'session_type': b.session_type,
            'location': b.location,
            'address_line_1': b.address_line_1 or b.location,
            'address_line_2': b.address_line_2,
            'postcode': b.postcode,
            'phone': b.phone,
            'is_home_visit': b.is_home_visit,
            'date': b.slot.date.isoformat() if b.slot else None,
            'block': b.slot.block if b.slot else None,
            'preferred_schedule': b.preferred_schedule or '',
            'status': b.status,
            'notes': b.notes,
            'access_instructions': b.access_instructions,
            'created_at': b.created_at.isoformat(),
            'payment': _payment_summary(payment),
        })

    editing_data = []
    for e in editing:
        payment = Payment.objects.filter(editing_request=e).first()
        editing_data.append({
            'id': e.id,
            'style_notes': e.style_notes[:80],
            'turnaround': e.turnaround,
            'package': e.package or None,
            'status': e.status,
            'quoted_price': str(e.quoted_price) if e.quoted_price is not None else None,
            'created_at': e.created_at.isoformat(),
            'payment': _payment_summary(payment),
        })

    return Response({
        'bookings': booking_data,
        'editing_requests': editing_data,
    })
