import os
from io import BytesIO

from django.core.files.uploadedfile import InMemoryUploadedFile
from django.db.models import Count, Q
from django.utils.text import slugify
from django.views.decorators.cache import never_cache
from PIL import Image, ImageOps
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response

from .models import Category, HeroSlot, PortfolioItem

PORTFOLIO_MAX_SIZE = 25 * 1024 * 1024
PORTFOLIO_ALLOWED_EXTS = {'.jpg', '.jpeg', '.png', '.tiff', '.tif'}
# Longest edge for on-site display (4K / retina hero). Quality 92 ≈ pristine on screen.
PORTFOLIO_MAX_LONG_EDGE = 4000
PORTFOLIO_JPEG_QUALITY = 92


def _prepare_portfolio_upload(uploaded):
    """
    Normalize portfolio images for web: EXIF-orient, cap long edge, high-quality JPEG.
    Skips re-encode when already a suitable JPEG under the size cap.
    """
    try:
        uploaded.seek(0)
        with Image.open(uploaded) as img:
            img = ImageOps.exif_transpose(img)
            width, height = img.size
            long_edge = max(width, height)
            name = getattr(uploaded, 'name', 'portfolio.jpg') or 'portfolio.jpg'
            ext = os.path.splitext(name)[1].lower()
            is_jpeg = ext in {'.jpg', '.jpeg'} or (img.format or '').upper() == 'JPEG'
            size = getattr(uploaded, 'size', None)

            if (
                is_jpeg
                and long_edge <= PORTFOLIO_MAX_LONG_EDGE
                and size is not None
                and size <= 3.5 * 1024 * 1024
            ):
                uploaded.seek(0)
                return uploaded

            if long_edge > PORTFOLIO_MAX_LONG_EDGE:
                scale = PORTFOLIO_MAX_LONG_EDGE / long_edge
                new_size = (
                    max(1, round(width * scale)),
                    max(1, round(height * scale)),
                )
                img = img.resize(new_size, Image.Resampling.LANCZOS)

            if img.mode not in ('RGB', 'L'):
                img = img.convert('RGB')
            elif img.mode == 'L':
                img = img.convert('RGB')

            buffer = BytesIO()
            img.save(
                buffer,
                format='JPEG',
                quality=PORTFOLIO_JPEG_QUALITY,
                optimize=True,
                progressive=True,
            )
            buffer.seek(0)
            base = os.path.splitext(os.path.basename(name))[0] or 'portfolio'
            out_name = f'{base}.jpg'
            return InMemoryUploadedFile(
                buffer,
                field_name='image',
                name=out_name,
                content_type='image/jpeg',
                size=buffer.getbuffer().nbytes,
                charset=None,
            )
    except Exception:
        try:
            uploaded.seek(0)
        except Exception:
            pass
        return uploaded


def _image_url(request, item):
    if not item.image:
        return None
    url = item.image.url
    if url.startswith('http://') or url.startswith('https://'):
        return url
    return request.build_absolute_uri(url)


def _serialize_item(request, item):
    return {
        'id': item.id,
        'title': item.title,
        'image_url': _image_url(request, item),
        'category_id': item.category_id,
        'category_name': item.category.name if item.category else None,
        'published': item.published,
        'order': item.order,
        'created_at': item.created_at.isoformat(),
    }


def _serialize_public_item(request, item):
    return {
        'id': item.id,
        'image_url': _image_url(request, item),
        'title': item.title,
        'category_name': item.category.name if item.category else None,
        'category_slug': item.category.slug if item.category else None,
        'order': item.order,
    }


def _hero_slot_for_item(item_id):
    slot = HeroSlot.objects.filter(portfolio_item_id=item_id).first()
    return slot.slot_number if slot else None


# --- Public ---

@never_cache
@api_view(['GET'])
@permission_classes([AllowAny])
def portfolio_list(request):
    qs = PortfolioItem.objects.filter(published=True).select_related('category')
    slug = request.query_params.get('category')
    if slug:
        qs = qs.filter(category__slug=slug)
    return Response([_serialize_public_item(request, item) for item in qs])


@never_cache
@api_view(['GET'])
@permission_classes([AllowAny])
def portfolio_categories_public(request):
    cats = (
        Category.objects.annotate(
            published_count=Count('items', filter=Q(items__published=True))
        )
        .filter(published_count__gt=0)
        .order_by('order', 'name')
    )
    return Response([
        {
            'id': c.id,
            'name': c.name,
            'slug': c.slug,
            'published_count': c.published_count,
        }
        for c in cats
    ])


@never_cache
@api_view(['GET'])
@permission_classes([AllowAny])
def portfolio_hero_public(request):
    slots = HeroSlot.objects.filter(
        portfolio_item__isnull=False,
        portfolio_item__published=True,
    ).select_related('portfolio_item').order_by('slot_number')
    return Response([
        {
            'slot_number': s.slot_number,
            'image_url': _image_url(request, s.portfolio_item),
            'title': s.portfolio_item.title,
            'position_x': s.position_x,
            'position_y': s.position_y,
            'fit_mode': s.fit_mode,
        }
        for s in slots
    ])


# --- Admin categories ---

@api_view(['GET', 'POST'])
@permission_classes([IsAdminUser])
def admin_portfolio_categories(request):
    if request.method == 'GET':
        cats = Category.objects.annotate(
            item_count=Count('items'),
            published_count=Count('items', filter=Q(items__published=True)),
        ).order_by('order', 'name')
        return Response([
            {
                'id': c.id,
                'name': c.name,
                'slug': c.slug,
                'order': c.order,
                'item_count': c.item_count,
                'published_count': c.published_count,
            }
            for c in cats
        ])

    name = request.data.get('name', '').strip()
    if not name:
        return Response({'error': 'name is required.'}, status=400)
    if Category.objects.filter(name__iexact=name).exists():
        return Response({'error': 'A category with this name already exists.'}, status=400)
    cat = Category.objects.create(name=name, slug=slugify(name))
    return Response({'id': cat.id, 'name': cat.name, 'slug': cat.slug, 'order': cat.order}, status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAdminUser])
def admin_portfolio_category_detail(request, pk):
    try:
        cat = Category.objects.get(pk=pk)
    except Category.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    if request.method == 'DELETE':
        PortfolioItem.objects.filter(category=cat).update(category=None)
        cat.delete()
        return Response({'ok': True})

    name = request.data.get('name', '').strip()
    if not name:
        return Response({'error': 'name is required.'}, status=400)
    cat.name = name
    cat.slug = slugify(name)
    cat.save()
    return Response({'id': cat.id, 'name': cat.name, 'slug': cat.slug})


# --- Admin items ---

@api_view(['GET', 'POST'])
@permission_classes([IsAdminUser])
def admin_portfolio_items(request):
    if request.method == 'GET':
        qs = PortfolioItem.objects.select_related('category').all()
        cat_id = request.query_params.get('category')
        if cat_id:
            qs = qs.filter(category_id=cat_id)
        published = request.query_params.get('published')
        if published is not None:
            qs = qs.filter(published=published.lower() == 'true')
        items = []
        for item in qs:
            data = _serialize_item(request, item)
            data['hero_slot'] = _hero_slot_for_item(item.id)
            items.append(data)
        return Response(items)

    image = request.FILES.get('image')
    if not image:
        return Response({'error': 'image is required.'}, status=400)
    ext = os.path.splitext(image.name)[1].lower()
    if ext not in PORTFOLIO_ALLOWED_EXTS:
        return Response({'error': f'Invalid file type. Allowed: {", ".join(sorted(PORTFOLIO_ALLOWED_EXTS))}'}, status=400)
    if image.size > PORTFOLIO_MAX_SIZE:
        return Response({'error': 'File exceeds 25 MB limit.'}, status=400)

    image = _prepare_portfolio_upload(image)

    title = request.data.get('title', '').strip()
    if not title:
        title = os.path.splitext(getattr(image, 'name', 'portfolio.jpg') or 'portfolio.jpg')[0]

    category_id = request.data.get('category')
    category = None
    if category_id:
        try:
            category = Category.objects.get(pk=category_id)
        except Category.DoesNotExist:
            return Response({'error': 'Invalid category.'}, status=400)

    item = PortfolioItem.objects.create(
        title=title,
        category=category,
        image=image,
        published=request.data.get('published', 'false').lower() == 'true',
    )
    data = _serialize_item(request, item)
    data['hero_slot'] = None
    return Response(data, status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAdminUser])
def admin_portfolio_item_detail(request, pk):
    try:
        item = PortfolioItem.objects.get(pk=pk)
    except PortfolioItem.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    if request.method == 'DELETE':
        if item.image:
            item.image.delete(save=False)
        item.delete()
        return Response({'ok': True})

    if 'title' in request.data:
        item.title = request.data.get('title', '').strip()
    if 'published' in request.data:
        item.published = bool(request.data.get('published'))
    if 'order' in request.data:
        item.order = int(request.data['order'])
    if 'category' in request.data:
        cat_id = request.data.get('category')
        if cat_id is None or cat_id == '':
            item.category = None
        else:
            try:
                item.category = Category.objects.get(pk=cat_id)
            except Category.DoesNotExist:
                return Response({'error': 'Invalid category.'}, status=400)
    item.save()
    data = _serialize_item(request, item)
    data['hero_slot'] = _hero_slot_for_item(item.id)
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_portfolio_items_reorder(request):
    items_data = request.data
    if not isinstance(items_data, list):
        return Response({'error': 'Expected a list of {id, order} objects.'}, status=400)
    for entry in items_data:
        PortfolioItem.objects.filter(pk=entry.get('id')).update(order=entry.get('order', 0))
    return Response({'ok': True})


# --- Admin hero ---

def _serialize_hero_slot(request, s):
    pi = s.portfolio_item
    return {
        'slot_number': s.slot_number,
        'position_x': s.position_x,
        'position_y': s.position_y,
        'fit_mode': s.fit_mode,
        'portfolio_item': {
            'id': pi.id,
            'image_url': _image_url(request, pi),
            'title': pi.title,
        } if pi else None,
    }


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_portfolio_hero(request):
    slots = HeroSlot.objects.select_related('portfolio_item').order_by('slot_number')
    return Response([_serialize_hero_slot(request, s) for s in slots])


@api_view(['PUT', 'PATCH', 'DELETE'])
@permission_classes([IsAdminUser])
def admin_portfolio_hero_slot(request, slot_number):
    try:
        slot = HeroSlot.objects.get(slot_number=slot_number)
    except HeroSlot.DoesNotExist:
        return Response({'error': 'Invalid slot.'}, status=404)

    if request.method == 'DELETE':
        slot.portfolio_item = None
        slot.position_x = 50
        slot.position_y = 50
        slot.fit_mode = 'cover'
        slot.save()
        return Response({'ok': True})

    if request.method == 'PATCH':
        if 'position_x' in request.data:
            slot.position_x = max(0, min(100, int(request.data['position_x'])))
        if 'position_y' in request.data:
            slot.position_y = max(0, min(100, int(request.data['position_y'])))
        if 'fit_mode' in request.data and request.data['fit_mode'] in ('cover', 'contain'):
            slot.fit_mode = request.data['fit_mode']
        slot.save()
        return Response(_serialize_hero_slot(request, slot))

    item_id = request.data.get('portfolio_item_id')
    if not item_id:
        return Response({'error': 'portfolio_item_id is required.'}, status=400)
    try:
        item = PortfolioItem.objects.get(pk=item_id)
    except PortfolioItem.DoesNotExist:
        return Response({'error': 'Portfolio item not found.'}, status=404)

    HeroSlot.objects.filter(portfolio_item=item).exclude(pk=slot.pk).update(portfolio_item=None)
    slot.portfolio_item = item
    slot.position_x = 50
    slot.position_y = 50
    slot.fit_mode = 'cover'
    slot.save()
    return Response(_serialize_hero_slot(request, slot))
