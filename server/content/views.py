import os
import urllib.request
import urllib.error
import json
import datetime as dt

from rest_framework.decorators import api_view, permission_classes
from django.db import transaction
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .models import AvailabilitySlot, BookingRequest, EditingFile, EditingRequest, Message, PortfolioItem, ServiceArea

UPLOAD_MAX_SIZE = 25 * 1024 * 1024  # 25 MB
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
    Returns (lat, lng) or raises ValueError if the postcode is invalid.
    Raises urllib.error.URLError if the service is unreachable.
    """
    clean = postcode.replace(' ', '').upper()
    url = f"https://api.postcodes.io/postcodes/{clean}"
    with urllib.request.urlopen(url, timeout=5) as resp:
        data = json.loads(resp.read())
    if data.get('status') != 200 or not data.get('result'):
        raise ValueError(f"Invalid or unknown postcode: {postcode}")
    result = data['result']
    return result['latitude'], result['longitude']


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticatedOrReadOnly])
def service_area_detail(request):
    area = ServiceArea.get()

    if request.method == 'GET':
        return Response({'polygon': area.polygon, 'updated_at': area.updated_at})

    # PATCH — staff only
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'error': 'Staff access required.'}, status=403)

    polygon = request.data.get('polygon')
    if not isinstance(polygon, list):
        return Response({'error': 'polygon must be a list of {lat, lng} objects.'}, status=400)

    area.polygon = polygon
    area.save()
    return Response({'polygon': area.polygon, 'updated_at': area.updated_at})


@api_view(['POST'])
@permission_classes([AllowAny])
def service_area_check(request):
    postcode = request.data.get('postcode', '').strip()
    if not postcode:
        return Response({'error': 'postcode is required.'}, status=400)

    try:
        lat, lng = _geocode_postcode(postcode)
    except ValueError as e:
        return Response({'error': str(e)}, status=400)
    except Exception:
        return Response({'error': 'Postcode lookup service unavailable. Please try again.'}, status=503)

    area = ServiceArea.get()
    is_within = _point_in_polygon(lat, lng, area.polygon)

    return Response({
        'postcode': postcode,
        'lat': lat,
        'lng': lng,
        'is_within_zone': is_within,
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
            'session_type': b.session_type,
            'status': b.status,
            'created_at': b.created_at.isoformat(),
        })

    recent_editing = []
    for e in EditingRequest.objects.select_related('customer').order_by('-created_at')[:5]:
        recent_editing.append({
            'id': e.id,
            'customer_email': e.customer.email,
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
        items.append({
            'id': b.id,
            'customer_email': b.customer.email,
            'session_type': b.session_type,
            'location': b.location,
            'postcode': b.postcode,
            'date': b.slot.date.isoformat() if b.slot else None,
            'status': b.status,
            'notes': b.notes,
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

    booking.status = new_status
    booking.save()
    return Response({'id': booking.id, 'status': booking.status})


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
        items.append({
            'id': e.id,
            'customer_email': e.customer.email,
            'style_notes': e.style_notes,
            'turnaround': e.turnaround,
            'status': e.status,
            'quoted_price': str(e.quoted_price) if e.quoted_price is not None else None,
            'file_count': e.files.count(),
            'created_at': e.created_at.isoformat(),
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


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_availability_list(request):
    month = request.query_params.get('month')
    if not month:
        return Response({'error': 'month param required (YYYY-MM)'}, status=400)
    try:
        year, mon = month.split('-')
        year, mon = int(year), int(mon)
    except (ValueError, AttributeError):
        return Response({'error': 'month must be YYYY-MM'}, status=400)

    slots = AvailabilitySlot.objects.filter(date__year=year, date__month=mon)
    return Response([{
        'id': s.id,
        'date': s.date.isoformat(),
        'block': s.block,
        'start_time': s.start_time.strftime('%H:%M'),
        'end_time': s.end_time.strftime('%H:%M'),
        'status': s.status,
        'is_booked': s.is_booked,
    } for s in slots])


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_availability_upsert(request):
    date_str = request.data.get('date', '')
    block    = request.data.get('block', '')
    status   = request.data.get('status', '')

    if not date_str or not block or not status:
        return Response({'error': 'date, block, and status are required.'}, status=400)

    valid_blocks   = [b[0] for b in AvailabilitySlot.BLOCK_CHOICES]
    valid_statuses = [s[0] for s in AvailabilitySlot.STATUS_CHOICES]

    if block not in valid_blocks:
        return Response({'error': f'block must be one of {valid_blocks}.'}, status=400)
    if status not in valid_statuses:
        return Response({'error': f'status must be one of {valid_statuses}.'}, status=400)

    try:
        date_obj = dt.date.fromisoformat(date_str)
    except ValueError:
        return Response({'error': 'date must be YYYY-MM-DD.'}, status=400)

    slot, _ = AvailabilitySlot.objects.update_or_create(
        date=date_obj, block=block,
        defaults={'status': status},
    )
    return Response({
        'id': slot.id,
        'date': slot.date.isoformat(),
        'block': slot.block,
        'start_time': slot.start_time.strftime('%H:%M'),
        'end_time': slot.end_time.strftime('%H:%M'),
        'status': slot.status,
        'is_booked': slot.is_booked,
    })


@api_view(['DELETE'])
@permission_classes([IsAdminUser])
def admin_availability_delete(request, pk):
    try:
        slot = AvailabilitySlot.objects.get(pk=pk)
    except AvailabilitySlot.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    if slot.is_booked:
        return Response({'error': 'Cannot delete a booked slot.'}, status=400)

    slot.delete()
    return Response(status=204)


@api_view(['GET'])
@permission_classes([AllowAny])
def customer_availability(request):
    month = request.query_params.get('month')
    if not month:
        return Response({'error': 'month param required (YYYY-MM)'}, status=400)
    try:
        year, mon = month.split('-')
        year, mon = int(year), int(mon)
        if not (1 <= mon <= 12):
            raise ValueError
    except (ValueError, AttributeError):
        return Response({'error': 'month must be YYYY-MM'}, status=400)

    slots = AvailabilitySlot.objects.filter(
        date__year=year, date__month=mon,
    ).exclude(status='unavailable').order_by('date', 'block')

    return Response([{
        'id': s.id,
        'date': s.date.isoformat(),
        'block': s.block,
        'start_time': s.start_time.strftime('%H:%M'),
        'end_time': s.end_time.strftime('%H:%M'),
        'status': s.status,
        'is_booked': s.is_booked,
    } for s in slots])


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_booking(request):
    slot_id      = request.data.get('slot_id')
    session_type = request.data.get('session_type', '').strip()
    location     = request.data.get('location', '').strip()
    postcode     = request.data.get('postcode', '').strip()
    notes        = request.data.get('notes', '').strip()

    if not slot_id or not session_type or not location or not postcode:
        return Response(
            {'error': 'slot_id, session_type, location, and postcode are required.'},
            status=400
        )

    valid_types = [s[0] for s in BookingRequest.SESSION_TYPES]
    if session_type not in valid_types:
        return Response({'error': f'session_type must be one of {valid_types}.'}, status=400)

    with transaction.atomic():
        try:
            slot = AvailabilitySlot.objects.select_for_update().get(pk=slot_id)
        except AvailabilitySlot.DoesNotExist:
            return Response({'error': 'Slot not found.'}, status=404)

        if slot.is_booked:
            return Response({'error': 'This slot has already been booked.'}, status=409)

        if slot.status not in ('available', 'potential'):
            return Response({'error': 'This slot is not available for booking.'}, status=409)

        booking = BookingRequest.objects.create(
            customer=request.user,
            session_type=session_type,
            location=location,
            postcode=postcode,
            notes=notes,
            slot=slot,
            status='pending',
        )
        slot.is_booked = True
        slot.save()

    return Response({'id': booking.id, 'status': booking.status}, status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_editing_request(request):
    style_notes = request.data.get('style_notes', '').strip()
    turnaround  = request.data.get('turnaround', '').strip()

    if not style_notes or not turnaround:
        return Response({'error': 'style_notes and turnaround are required.'}, status=400)

    if len(turnaround) > 200:
        return Response({'error': 'turnaround must be 200 characters or fewer.'}, status=400)
    if len(style_notes) > 2000:
        return Response({'error': 'style_notes must be 2000 characters or fewer.'}, status=400)

    editing = EditingRequest.objects.create(
        customer=request.user,
        style_notes=style_notes,
        turnaround=turnaround,
    )
    return Response({'id': editing.id, 'status': editing.status}, status=201)


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

    MAX_FILES_PER_REQUEST = 50
    if EditingFile.objects.filter(editing_request=editing).count() >= MAX_FILES_PER_REQUEST:
        return Response({'error': f'Maximum {MAX_FILES_PER_REQUEST} files per request.'}, status=400)

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
def portfolio_list(request):
    """
    Returns all portfolio items ordered by `order` then `-created_at`.
    Optional query param: ?category=wedding
    """
    qs = PortfolioItem.objects.all()
    category = request.query_params.get('category')
    if category:
        qs = qs.filter(category=category)
    items = []
    for item in qs:
        items.append({
            'id': item.id,
            'title': item.title,
            'category': item.category,
            'image': request.build_absolute_uri(item.image.url) if item.image else None,
            'featured': item.featured,
            'order': item.order,
        })
    return Response(items)
