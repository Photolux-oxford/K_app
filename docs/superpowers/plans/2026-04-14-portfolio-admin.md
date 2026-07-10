# Portfolio Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full portfolio management admin panel (Library, Grid, Hero, Categories sub-tabs) backed by new Django models and REST endpoints, and update the public Portfolio and Hero components to fetch from the API.

**Architecture:** Three new Django models (Category, modified PortfolioItem, HeroSlot) with 12 REST endpoints split between admin-only and public. Frontend adds an AdminPortfolio page with four focused sub-tab components, plus updated public-facing Portfolio.tsx and Hero.tsx.

**Tech Stack:** Django 4.x, Django REST Framework, Pillow (already installed), React 18, TypeScript, HTML5 drag API, Vite.

---

## File Map

**Backend (server/)**

| File | Action | Purpose |
|---|---|---|
| `server/content/models.py` | Modify | Add Category, HeroSlot models; modify PortfolioItem |
| `server/content/migrations/0006_category_heroslot_portfolioitem_update.py` | Create | Schema migration |
| `server/content/migrations/0007_seed_heroslots.py` | Create | Data migration seeding 6 HeroSlot rows |
| `server/content/serializers.py` | Modify | Add CategorySerializer, PortfolioItemSerializer, HeroSlotSerializer |
| `server/content/views.py` | Modify | Add 12 admin+public portfolio endpoints |
| `server/content/urls.py` | Modify | Wire new URL patterns |
| `server/content/tests/test_portfolio_admin.py` | Create | All portfolio API tests |

**Frontend (client/src/app/)**

| File | Action | Purpose |
|---|---|---|
| `client/src/app/components/admin/AdminLayout.tsx` | Modify | Add 'portfolio' to AdminTab type and TABS array |
| `client/src/app/App.tsx` | Modify | Add `/admin/portfolio` route |
| `client/src/app/pages/admin/AdminPortfolio.tsx` | Create | Outer page, sub-tab state manager |
| `client/src/app/components/admin/portfolio/LibraryTab.tsx` | Create | Upload zone + photo grid + edit strip |
| `client/src/app/components/admin/portfolio/GridTab.tsx` | Create | Category pills + drag-to-reorder |
| `client/src/app/components/admin/portfolio/HeroTab.tsx` | Create | 6 slot cards + photo picker strip |
| `client/src/app/components/admin/portfolio/CategoriesTab.tsx` | Create | Inline rename, add, delete categories |
| `client/src/app/components/Portfolio.tsx` | Modify | Fetch from API instead of placeholders |
| `client/src/app/components/Hero.tsx` | Modify | Fetch from API instead of hardcoded slides |

---

## Task 1: Backend Models + Migrations

**Files:**
- Modify: `server/content/models.py`
- Create: `server/content/migrations/0006_category_heroslot_portfolioitem_update.py`
- Create: `server/content/migrations/0007_seed_heroslots.py`

- [ ] **Step 1: Read existing models**

```bash
cat server/content/models.py
```

Confirm that `PortfolioItem` has `title`, `category` (CharField), `image`, `featured`, `order`, `created_at`. No Category or HeroSlot models exist.

- [ ] **Step 2: Update models.py**

Replace the `PortfolioItem` class and add new models. The final block at the end of `models.py` (after all existing models) should be:

```python
from django.utils.text import slugify

class Category(models.Model):
    name  = models.CharField(max_length=100, unique=True)
    slug  = models.SlugField(max_length=100, unique=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'name']

    def save(self, *args, **kwargs):
        self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name
```

Replace the existing `PortfolioItem` with:

```python
class PortfolioItem(models.Model):
    title      = models.CharField(max_length=200, blank=True)
    category   = models.ForeignKey(
        'Category', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='items'
    )
    image      = models.ImageField(upload_to='portfolio/')
    published  = models.BooleanField(default=False)
    order      = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', '-created_at']

    def __str__(self):
        return self.title or str(self.image)
```

Add after PortfolioItem:

```python
class HeroSlot(models.Model):
    slot_number    = models.PositiveSmallIntegerField(unique=True)
    portfolio_item = models.ForeignKey(
        PortfolioItem, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='hero_slots'
    )

    class Meta:
        ordering = ['slot_number']

    def __str__(self):
        return f'Slot {self.slot_number}'
```

- [ ] **Step 3: Generate the schema migration**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app/server
python manage.py makemigrations content --name category_heroslot_portfolioitem_update
```

Expected output: `Migrations for 'content': content/migrations/0006_category_heroslot_portfolioitem_update.py`

- [ ] **Step 4: Review the auto-generated migration**

Open `server/content/migrations/0006_category_heroslot_portfolioitem_update.py`. Verify it:
- Creates the `Category` table
- Creates the `HeroSlot` table
- Changes `PortfolioItem.category` from CharField to ForeignKey
- Removes `PortfolioItem.featured`
- Adds `PortfolioItem.published`

If any of these are missing, add them manually.

The migration must also set `published=True` for existing rows so nothing disappears on upgrade. Add a `RunPython` step in the migration's `operations` list:

```python
from django.db import migrations, models
import django.db.models.deletion

def set_existing_published(apps, schema_editor):
    PortfolioItem = apps.get_model('content', 'PortfolioItem')
    PortfolioItem.objects.all().update(published=True)

def migrate_categories(apps, schema_editor):
    PortfolioItem = apps.get_model('content', 'PortfolioItem')
    Category = apps.get_model('content', 'Category')
    # If there are items with a legacy category string, create Category rows
    # (Only relevant if existing data exists; safe to run on empty DB)
    pass  # The FK field starts as null=True; no old data needs migrating here

class Migration(migrations.Migration):
    # ... existing dependencies and operations ...
    # Add at the end of operations:
    # migrations.RunPython(set_existing_published, migrations.RunPython.noop),
```

Add `migrations.RunPython(set_existing_published, migrations.RunPython.noop)` to the `operations` list at the end of the auto-generated migration (after all `AlterField`/`AddField` operations).

- [ ] **Step 5: Create the data migration for seeding HeroSlots**

```bash
python manage.py makemigrations content --empty --name seed_heroslots
```

Edit the resulting `0007_seed_heroslots.py`:

```python
from django.db import migrations

def seed_slots(apps, schema_editor):
    HeroSlot = apps.get_model('content', 'HeroSlot')
    for n in range(1, 7):
        HeroSlot.objects.get_or_create(slot_number=n)

class Migration(migrations.Migration):
    dependencies = [
        ('content', '0006_category_heroslot_portfolioitem_update'),
    ]
    operations = [
        migrations.RunPython(seed_slots, migrations.RunPython.noop),
    ]
```

- [ ] **Step 6: Run migrations**

```bash
python manage.py migrate content
```

Expected: all 7 migrations run without errors.

- [ ] **Step 7: Verify in shell**

```bash
python manage.py shell -c "
from content.models import Category, PortfolioItem, HeroSlot
print('HeroSlot count:', HeroSlot.objects.count())  # expect 6
print('PortfolioItem fields:', [f.name for f in PortfolioItem._meta.get_fields()])
"
```

Expected output: `HeroSlot count: 6` and field list includes `published`, `category` (FK), no `featured`.

- [ ] **Step 8: Commit**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app
git add server/content/models.py server/content/migrations/
git commit -m "feat: add Category, HeroSlot models; update PortfolioItem"
```

---

## Task 2: Backend Serializers

**Files:**
- Modify: `server/content/serializers.py`

- [ ] **Step 1: Read current serializers.py**

```bash
cat server/content/serializers.py
```

Note existing serializers to avoid naming conflicts.

- [ ] **Step 2: Add portfolio serializers**

Append to `serializers.py`:

```python
from .models import Category, PortfolioItem, HeroSlot

class CategorySerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'order', 'item_count']


class PortfolioItemSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    category_id = serializers.PrimaryKeyRelatedField(
        source='category', queryset=Category.objects.all(),
        allow_null=True, required=False
    )
    category_name = serializers.SerializerMethodField()
    hero_slots = serializers.SerializerMethodField()

    class Meta:
        model = PortfolioItem
        fields = [
            'id', 'title', 'image_url', 'category_id', 'category_name',
            'published', 'order', 'hero_slots',
        ]

    def get_image_url(self, obj):
        request = self.context.get('request')
        if request and obj.image:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url if obj.image else None

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    def get_hero_slots(self, obj):
        return list(obj.hero_slots.values_list('slot_number', flat=True))


class HeroSlotSerializer(serializers.ModelSerializer):
    portfolio_item = serializers.SerializerMethodField()

    class Meta:
        model = HeroSlot
        fields = ['slot_number', 'portfolio_item']

    def get_portfolio_item(self, obj):
        if obj.portfolio_item is None:
            return None
        request = self.context.get('request')
        item = obj.portfolio_item
        image_url = request.build_absolute_uri(item.image.url) if request and item.image else (item.image.url if item.image else None)
        return {'id': item.id, 'title': item.title, 'image_url': image_url}


class PublicCategorySerializer(serializers.ModelSerializer):
    published_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'published_count']
```

- [ ] **Step 3: Verify no import errors**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app/server
python manage.py check
```

Expected: `System check identified no issues.`

- [ ] **Step 4: Commit**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app
git add server/content/serializers.py
git commit -m "feat: add portfolio, category, hero slot serializers"
```

---

## Task 3: Backend API — Categories + Tests

**Files:**
- Modify: `server/content/views.py`
- Modify: `server/content/urls.py`
- Create: `server/content/tests/test_portfolio_admin.py`

- [ ] **Step 1: Write failing tests first**

Create `server/content/tests/test_portfolio_admin.py`:

```python
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from content.models import Category, PortfolioItem, HeroSlot

User = get_user_model()


def get_token(user):
    return str(RefreshToken.for_user(user).access_token)


class CategoryAPITests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user('staff', password='pw', is_staff=True)
        self.customer = User.objects.create_user('cust', password='pw')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_token(self.staff)}')

    def test_list_categories(self):
        Category.objects.create(name='Wedding', slug='wedding', order=0)
        resp = self.client.get('/api/admin/portfolio/categories/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)
        self.assertEqual(resp.json()[0]['name'], 'Wedding')

    def test_create_category_slug_auto(self):
        resp = self.client.post('/api/admin/portfolio/categories/', {'name': 'My Category'}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()['slug'], 'my-category')

    def test_rename_category(self):
        cat = Category.objects.create(name='Old', slug='old')
        resp = self.client.patch(f'/api/admin/portfolio/categories/{cat.id}/', {'name': 'New'}, format='json')
        self.assertEqual(resp.status_code, 200)
        cat.refresh_from_db()
        self.assertEqual(cat.name, 'New')
        self.assertEqual(cat.slug, 'new')

    def test_delete_category_nullifies_items(self):
        cat = Category.objects.create(name='Tmp', slug='tmp')
        item = PortfolioItem.objects.create(title='p', category=cat, image='portfolio/x.jpg')
        resp = self.client.delete(f'/api/admin/portfolio/categories/{cat.id}/')
        self.assertEqual(resp.status_code, 200)
        item.refresh_from_db()
        self.assertIsNone(item.category)

    def test_unauthenticated_denied(self):
        self.client.credentials()
        resp = self.client.get('/api/admin/portfolio/categories/')
        self.assertEqual(resp.status_code, 401)

    def test_non_staff_denied(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_token(self.customer)}')
        resp = self.client.get('/api/admin/portfolio/categories/')
        self.assertEqual(resp.status_code, 403)
```

- [ ] **Step 2: Run tests — expect FAIL (no views yet)**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app/server
python manage.py test content.tests.test_portfolio_admin.CategoryAPITests -v 2
```

Expected: `AttributeError` or `404` — views don't exist yet.

- [ ] **Step 3: Add category views to views.py**

Add at the end of `server/content/views.py`:

```python
from django.db.models import Count
from .models import Category, HeroSlot
from .serializers import (
    CategorySerializer, PortfolioItemSerializer,
    HeroSlotSerializer, PublicCategorySerializer,
)

# ── Admin: Categories ────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAdminUser])
def admin_category_list(request):
    if request.method == 'GET':
        cats = Category.objects.annotate(item_count=Count('items'))
        return Response(CategorySerializer(cats, many=True, context={'request': request}).data)

    serializer = CategorySerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAdminUser])
def admin_category_detail(request, pk):
    cat = get_object_or_404(Category, pk=pk)

    if request.method == 'PATCH':
        serializer = CategorySerializer(cat, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    # DELETE
    cat.items.all().update(category=None)
    cat.delete()
    return Response({'detail': 'deleted'})
```

- [ ] **Step 4: Wire category URLs**

In `server/content/urls.py`, add:

```python
from .views import admin_category_list, admin_category_detail

urlpatterns = [
    # ... existing patterns ...
    path('admin/portfolio/categories/', admin_category_list),
    path('admin/portfolio/categories/<int:pk>/', admin_category_detail),
]
```

- [ ] **Step 5: Run category tests — expect PASS**

```bash
python manage.py test content.tests.test_portfolio_admin.CategoryAPITests -v 2
```

Expected: `OK` — all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app
git add server/content/views.py server/content/urls.py server/content/tests/test_portfolio_admin.py
git commit -m "feat: admin category CRUD API + tests"
```

---

## Task 4: Backend API — Portfolio Items + Tests

**Files:**
- Modify: `server/content/views.py`
- Modify: `server/content/urls.py`
- Modify: `server/content/tests/test_portfolio_admin.py`

- [ ] **Step 1: Write failing item tests — append to test file**

Add to `server/content/tests/test_portfolio_admin.py`:

```python
import tempfile, os
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image as PILImage
import io


def make_image_file(name='test.jpg', fmt='JPEG'):
    buf = io.BytesIO()
    PILImage.new('RGB', (100, 100), color=(100, 100, 100)).save(buf, format=fmt)
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type='image/jpeg')


class PortfolioItemAPITests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user('staff2', password='pw', is_staff=True)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_token(self.staff)}')
        self.cat = Category.objects.create(name='Wedding', slug='wedding')

    def test_list_items(self):
        PortfolioItem.objects.create(title='a', image='portfolio/a.jpg')
        resp = self.client.get('/api/admin/portfolio/items/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)

    def test_filter_by_category(self):
        PortfolioItem.objects.create(title='a', image='portfolio/a.jpg', category=self.cat)
        PortfolioItem.objects.create(title='b', image='portfolio/b.jpg')
        resp = self.client.get(f'/api/admin/portfolio/items/?category={self.cat.id}')
        self.assertEqual(len(resp.json()), 1)

    def test_filter_published(self):
        PortfolioItem.objects.create(title='pub', image='portfolio/a.jpg', published=True)
        PortfolioItem.objects.create(title='unpub', image='portfolio/b.jpg', published=False)
        resp = self.client.get('/api/admin/portfolio/items/?published=true')
        self.assertEqual(len(resp.json()), 1)
        self.assertEqual(resp.json()[0]['title'], 'pub')

    def test_upload_valid_image(self):
        img = make_image_file()
        resp = self.client.post('/api/admin/portfolio/items/', {'image': img}, format='multipart')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(PortfolioItem.objects.exists())

    def test_upload_sets_title_from_filename(self):
        img = make_image_file('my_photo.jpg')
        resp = self.client.post('/api/admin/portfolio/items/', {'image': img}, format='multipart')
        self.assertEqual(resp.status_code, 201)
        item = PortfolioItem.objects.get(id=resp.json()['id'])
        self.assertEqual(item.title, 'my_photo')

    def test_upload_invalid_extension_rejected(self):
        bad = SimpleUploadedFile('file.gif', b'GIF89a', content_type='image/gif')
        resp = self.client.post('/api/admin/portfolio/items/', {'image': bad}, format='multipart')
        self.assertEqual(resp.status_code, 400)

    def test_upload_too_large_rejected(self):
        # Create a file exceeding 25 MB
        big = SimpleUploadedFile('big.jpg', b'x' * (26 * 1024 * 1024), content_type='image/jpeg')
        resp = self.client.post('/api/admin/portfolio/items/', {'image': big}, format='multipart')
        self.assertEqual(resp.status_code, 400)

    def test_patch_item(self):
        item = PortfolioItem.objects.create(title='old', image='portfolio/a.jpg')
        resp = self.client.patch(
            f'/api/admin/portfolio/items/{item.id}/',
            {'published': True, 'title': 'new'},
            format='json'
        )
        self.assertEqual(resp.status_code, 200)
        item.refresh_from_db()
        self.assertTrue(item.published)
        self.assertEqual(item.title, 'new')

    def test_delete_item(self):
        item = PortfolioItem.objects.create(title='del', image='portfolio/del.jpg')
        resp = self.client.delete(f'/api/admin/portfolio/items/{item.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(PortfolioItem.objects.filter(id=item.id).exists())

    def test_reorder(self):
        a = PortfolioItem.objects.create(title='a', image='portfolio/a.jpg', order=0)
        b = PortfolioItem.objects.create(title='b', image='portfolio/b.jpg', order=1)
        resp = self.client.post(
            '/api/admin/portfolio/items/reorder/',
            [{'id': a.id, 'order': 10}, {'id': b.id, 'order': 5}],
            format='json'
        )
        self.assertEqual(resp.status_code, 200)
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertEqual(a.order, 10)
        self.assertEqual(b.order, 5)
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
python manage.py test content.tests.test_portfolio_admin.PortfolioItemAPITests -v 2
```

Expected: failures because views don't exist.

- [ ] **Step 3: Add item views to views.py**

Append to `server/content/views.py`:

```python
import os
from django.conf import settings

PORTFOLIO_ALLOWED_EXTS = {'.jpg', '.jpeg', '.png', '.tiff', '.tif'}
PORTFOLIO_MAX_SIZE = 25 * 1024 * 1024  # 25 MB


@api_view(['GET', 'POST'])
@permission_classes([IsAdminUser])
def admin_item_list(request):
    if request.method == 'GET':
        qs = PortfolioItem.objects.select_related('category')
        cat_id = request.query_params.get('category')
        if cat_id:
            qs = qs.filter(category_id=cat_id)
        published = request.query_params.get('published')
        if published is not None:
            qs = qs.filter(published=published.lower() == 'true')
        return Response(PortfolioItemSerializer(qs, many=True, context={'request': request}).data)

    # POST — upload
    file = request.FILES.get('image')
    if not file:
        return Response({'error': 'image required'}, status=400)
    if file.size > PORTFOLIO_MAX_SIZE:
        return Response({'error': 'File exceeds 25 MB limit'}, status=400)
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in PORTFOLIO_ALLOWED_EXTS:
        return Response({'error': f'File type {ext} not allowed'}, status=400)

    title = request.data.get('title') or os.path.splitext(file.name)[0]
    cat_id = request.data.get('category')
    category = Category.objects.filter(pk=cat_id).first() if cat_id else None

    item = PortfolioItem.objects.create(
        title=title,
        image=file,
        category=category,
        published=False,
    )
    return Response(PortfolioItemSerializer(item, context={'request': request}).data, status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAdminUser])
def admin_item_detail(request, pk):
    item = get_object_or_404(PortfolioItem, pk=pk)

    if request.method == 'PATCH':
        for field in ('title', 'published', 'order'):
            if field in request.data:
                setattr(item, field, request.data[field])
        cat_id = request.data.get('category_id')
        if 'category_id' in request.data:
            item.category = Category.objects.filter(pk=cat_id).first() if cat_id else None
        item.save()
        return Response(PortfolioItemSerializer(item, context={'request': request}).data)

    # DELETE — remove file from disk
    if item.image and item.image.name:
        path = item.image.path
        if os.path.exists(path):
            os.remove(path)
    item.delete()
    return Response({'detail': 'deleted'})


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_item_reorder(request):
    for entry in request.data:
        PortfolioItem.objects.filter(pk=entry['id']).update(order=entry['order'])
    return Response({'detail': 'reordered'})
```

- [ ] **Step 4: Wire item URLs**

In `server/content/urls.py`, add:

```python
from .views import admin_item_list, admin_item_detail, admin_item_reorder

urlpatterns += [
    path('admin/portfolio/items/', admin_item_list),
    path('admin/portfolio/items/<int:pk>/', admin_item_detail),
    path('admin/portfolio/items/reorder/', admin_item_reorder),
]
```

**Important:** The `reorder/` path must come before `<int:pk>/` in the URL list to avoid Django matching "reorder" as a pk. Verify order in urls.py.

- [ ] **Step 5: Run item tests — expect PASS**

```bash
python manage.py test content.tests.test_portfolio_admin.PortfolioItemAPITests -v 2
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app
git add server/content/views.py server/content/urls.py server/content/tests/test_portfolio_admin.py
git commit -m "feat: admin portfolio items CRUD, upload, reorder API + tests"
```

---

## Task 5: Backend API — Hero Slots + Tests

**Files:**
- Modify: `server/content/views.py`
- Modify: `server/content/urls.py`
- Modify: `server/content/tests/test_portfolio_admin.py`

- [ ] **Step 1: Write failing hero tests — append to test file**

```python
class HeroSlotAPITests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user('staff3', password='pw', is_staff=True)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_token(self.staff)}')
        # Seed 6 slots (normally done by data migration; do it here for tests)
        for n in range(1, 7):
            HeroSlot.objects.get_or_create(slot_number=n)
        self.item = PortfolioItem.objects.create(title='hero_img', image='portfolio/h.jpg', published=True)

    def test_list_all_six_slots(self):
        resp = self.client.get('/api/admin/portfolio/hero/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 6)

    def test_assign_item_to_slot(self):
        resp = self.client.put(
            '/api/admin/portfolio/hero/1/',
            {'portfolio_item_id': self.item.id},
            format='json'
        )
        self.assertEqual(resp.status_code, 200)
        slot = HeroSlot.objects.get(slot_number=1)
        self.assertEqual(slot.portfolio_item_id, self.item.id)

    def test_assign_moves_item_from_previous_slot(self):
        HeroSlot.objects.filter(slot_number=1).update(portfolio_item=self.item)
        resp = self.client.put(
            '/api/admin/portfolio/hero/2/',
            {'portfolio_item_id': self.item.id},
            format='json'
        )
        self.assertEqual(resp.status_code, 200)
        # Slot 1 should now be empty
        self.assertIsNone(HeroSlot.objects.get(slot_number=1).portfolio_item)
        self.assertEqual(HeroSlot.objects.get(slot_number=2).portfolio_item_id, self.item.id)

    def test_clear_slot(self):
        HeroSlot.objects.filter(slot_number=3).update(portfolio_item=self.item)
        resp = self.client.delete('/api/admin/portfolio/hero/3/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(HeroSlot.objects.get(slot_number=3).portfolio_item)

    def test_invalid_slot_number(self):
        resp = self.client.put(
            '/api/admin/portfolio/hero/99/',
            {'portfolio_item_id': self.item.id},
            format='json'
        )
        self.assertEqual(resp.status_code, 404)
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
python manage.py test content.tests.test_portfolio_admin.HeroSlotAPITests -v 2
```

Expected: failures because views don't exist.

- [ ] **Step 3: Add hero slot views to views.py**

```python
@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_hero_list(request):
    slots = HeroSlot.objects.select_related('portfolio_item')
    return Response(HeroSlotSerializer(slots, many=True, context={'request': request}).data)


@api_view(['PUT', 'DELETE'])
@permission_classes([IsAdminUser])
def admin_hero_detail(request, slot_number):
    slot = get_object_or_404(HeroSlot, slot_number=slot_number)

    if request.method == 'PUT':
        item_id = request.data.get('portfolio_item_id')
        item = get_object_or_404(PortfolioItem, pk=item_id)
        # Remove item from any other slot it currently occupies
        HeroSlot.objects.filter(portfolio_item=item).exclude(slot_number=slot_number).update(portfolio_item=None)
        slot.portfolio_item = item
        slot.save()
        return Response(HeroSlotSerializer(slot, context={'request': request}).data)

    # DELETE
    slot.portfolio_item = None
    slot.save()
    return Response({'detail': 'cleared'})
```

- [ ] **Step 4: Wire hero URLs**

```python
from .views import admin_hero_list, admin_hero_detail

urlpatterns += [
    path('admin/portfolio/hero/', admin_hero_list),
    path('admin/portfolio/hero/<int:slot_number>/', admin_hero_detail),
]
```

- [ ] **Step 5: Run hero tests — expect PASS**

```bash
python manage.py test content.tests.test_portfolio_admin.HeroSlotAPITests -v 2
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app
git add server/content/views.py server/content/urls.py server/content/tests/test_portfolio_admin.py
git commit -m "feat: admin hero slot API + tests"
```

---

## Task 6: Backend API — Updated Public Endpoints + Tests

**Files:**
- Modify: `server/content/views.py`
- Modify: `server/content/urls.py`
- Modify: `server/content/tests/test_portfolio_admin.py`

- [ ] **Step 1: Write failing public endpoint tests**

```python
class PublicPortfolioAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cat = Category.objects.create(name='Wedding', slug='wedding')
        self.pub = PortfolioItem.objects.create(
            title='published', image='portfolio/p.jpg',
            published=True, category=self.cat, order=0
        )
        self.unpub = PortfolioItem.objects.create(
            title='unpublished', image='portfolio/u.jpg',
            published=False, category=self.cat
        )
        for n in range(1, 7):
            HeroSlot.objects.get_or_create(slot_number=n)
        HeroSlot.objects.filter(slot_number=1).update(portfolio_item=self.pub)

    def test_portfolio_returns_only_published(self):
        resp = self.client.get('/api/portfolio/')
        self.assertEqual(resp.status_code, 200)
        ids = [i['id'] for i in resp.json()]
        self.assertIn(self.pub.id, ids)
        self.assertNotIn(self.unpub.id, ids)

    def test_portfolio_category_filter(self):
        cat2 = Category.objects.create(name='Portrait', slug='portrait')
        PortfolioItem.objects.create(title='p2', image='portfolio/p2.jpg', published=True, category=cat2)
        resp = self.client.get(f'/api/portfolio/?category=wedding')
        data = resp.json()
        self.assertTrue(all(i['category_slug'] == 'wedding' for i in data))

    def test_hero_endpoint_skips_empty_slots(self):
        resp = self.client.get('/api/portfolio/hero/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)  # Only slot 1 is filled
        self.assertEqual(data[0]['slot_number'], 1)

    def test_public_categories_only_with_published(self):
        cat2 = Category.objects.create(name='Empty', slug='empty')
        resp = self.client.get('/api/portfolio/categories/')
        slugs = [c['slug'] for c in resp.json()]
        self.assertIn('wedding', slugs)
        self.assertNotIn('empty', slugs)

    def test_public_categories_published_count(self):
        resp = self.client.get('/api/portfolio/categories/')
        wedding = next(c for c in resp.json() if c['slug'] == 'wedding')
        self.assertEqual(wedding['published_count'], 1)
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
python manage.py test content.tests.test_portfolio_admin.PublicPortfolioAPITests -v 2
```

- [ ] **Step 3: Replace / update the existing `portfolio_list` view and add new public views**

Find the existing `portfolio_list` view in `views.py` (around line 487) and replace it entirely, then add the two new public views:

```python
# ── Public: Portfolio ────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def portfolio_list(request):
    qs = PortfolioItem.objects.filter(published=True).select_related('category')
    cat_slug = request.query_params.get('category')
    if cat_slug:
        qs = qs.filter(category__slug=cat_slug)
    data = []
    for item in qs:
        image_url = request.build_absolute_uri(item.image.url) if item.image else None
        data.append({
            'id': item.id,
            'title': item.title,
            'image_url': image_url,
            'category_name': item.category.name if item.category else None,
            'category_slug': item.category.slug if item.category else None,
            'order': item.order,
        })
    return Response(data)


@api_view(['GET'])
@permission_classes([AllowAny])
def portfolio_hero_public(request):
    slots = HeroSlot.objects.select_related('portfolio_item').order_by('slot_number')
    data = []
    for slot in slots:
        if slot.portfolio_item is None:
            continue
        item = slot.portfolio_item
        image_url = request.build_absolute_uri(item.image.url) if item.image else None
        data.append({
            'slot_number': slot.slot_number,
            'image_url': image_url,
            'title': item.title,
        })
    return Response(data)


@api_view(['GET'])
@permission_classes([AllowAny])
def portfolio_categories_public(request):
    cats = Category.objects.annotate(
        published_count=Count('items', filter=models.Q(items__published=True))
    ).filter(published_count__gt=0)
    return Response(PublicCategorySerializer(cats, many=True).data)
```

Note: add `from django.db import models as django_models` at the top of views.py if `models.Q` conflicts; or use `from django.db.models import Q` and reference `Q` directly.

Actually, use this import-safe version for the filter:

```python
from django.db.models import Count, Q

cats = Category.objects.annotate(
    published_count=Count('items', filter=Q(items__published=True))
).filter(published_count__gt=0)
```

- [ ] **Step 4: Wire public URLs**

In `urls.py`, update the existing `portfolio/` path and add new ones:

```python
from .views import portfolio_list, portfolio_hero_public, portfolio_categories_public

urlpatterns += [
    # existing: path('portfolio/', portfolio_list) — already exists, just updated in views.py
    path('portfolio/hero/', portfolio_hero_public),
    path('portfolio/categories/', portfolio_categories_public),
]
```

Verify the `portfolio/` path already exists in `urls.py` (pointing to `portfolio_list`). Only add it if it's missing.

- [ ] **Step 5: Run all portfolio tests**

```bash
python manage.py test content.tests.test_portfolio_admin -v 2
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app
git add server/content/views.py server/content/urls.py server/content/tests/test_portfolio_admin.py
git commit -m "feat: updated public portfolio, hero, categories endpoints + tests"
```

---

## Task 7: Frontend — AdminLayout Tab + Route + AdminPortfolio Skeleton

**Files:**
- Modify: `client/src/app/components/admin/AdminLayout.tsx`
- Modify: `client/src/app/App.tsx`
- Create: `client/src/app/pages/admin/AdminPortfolio.tsx`

- [ ] **Step 1: Read AdminLayout.tsx**

Open `client/src/app/components/admin/AdminLayout.tsx`. Note the `AdminTab` type and the `TABS` array structure.

- [ ] **Step 2: Add 'portfolio' to AdminLayout**

In `AdminLayout.tsx`:

1. Find `type AdminTab = ...` and add `'portfolio'` to the union.
2. Find the `TABS` array and insert a portfolio entry between Dashboard and Bookings:

```typescript
{ label: 'Portfolio', tab: 'portfolio', path: '/admin/portfolio' },
```

- [ ] **Step 3: Read App.tsx**

Open `client/src/app/App.tsx`. Note the admin route pattern.

- [ ] **Step 4: Add portfolio route to App.tsx**

Add the import and route:

```typescript
import { AdminPortfolio } from './pages/admin/AdminPortfolio';
// Inside the Routes:
<Route path="/admin/portfolio" element={<AdminPortfolio />} />
```

Place it alongside the other `/admin/*` routes.

- [ ] **Step 5: Create AdminPortfolio.tsx**

Create `client/src/app/pages/admin/AdminPortfolio.tsx`:

```typescript
import { useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { LibraryTab } from '../../components/admin/portfolio/LibraryTab';
import { GridTab } from '../../components/admin/portfolio/GridTab';
import { HeroTab } from '../../components/admin/portfolio/HeroTab';
import { CategoriesTab } from '../../components/admin/portfolio/CategoriesTab';

type SubTab = 'library' | 'grid' | 'hero' | 'categories';

const FONT = "'Helvetica Neue', Arial, sans-serif";

const SUB_TABS: { label: string; key: SubTab }[] = [
  { label: 'LIBRARY', key: 'library' },
  { label: 'GRID', key: 'grid' },
  { label: 'HERO', key: 'hero' },
  { label: 'CATEGORIES', key: 'categories' },
];

export function AdminPortfolio() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('library');

  return (
    <AdminLayout activeTab="portfolio">
      <div style={{ fontFamily: FONT, margin: '-40px -32px' }}>
        {/* Sub-tab bar */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e5e7eb',
          padding: '0 32px',
          background: '#fff',
          gap: 24,
        }}>
          {SUB_TABS.map(({ label, key }) => (
            <button
              key={key}
              onClick={() => setActiveSubTab(key)}
              style={{
                padding: '12px 0',
                fontSize: 11,
                fontWeight: activeSubTab === key ? 700 : 400,
                letterSpacing: '0.08em',
                color: activeSubTab === key ? '#111' : '#aaa',
                borderBottom: activeSubTab === key ? '2px solid #111' : '2px solid transparent',
                background: 'none',
                border: 'none',
                borderBottomWidth: 2,
                borderBottomStyle: 'solid',
                borderBottomColor: activeSubTab === key ? '#111' : 'transparent',
                cursor: 'pointer',
                fontFamily: FONT,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sub-tab content */}
        <div style={{ padding: '24px 32px' }}>
          {activeSubTab === 'library' && <LibraryTab />}
          {activeSubTab === 'grid' && <GridTab />}
          {activeSubTab === 'hero' && <HeroTab />}
          {activeSubTab === 'categories' && <CategoriesTab />}
        </div>
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 6: Create stub components so the page compiles**

Create `client/src/app/components/admin/portfolio/LibraryTab.tsx`:

```typescript
export function LibraryTab() {
  return <div style={{ color: '#aaa', fontSize: 13 }}>Library — coming soon</div>;
}
```

Create `client/src/app/components/admin/portfolio/GridTab.tsx`:

```typescript
export function GridTab() {
  return <div style={{ color: '#aaa', fontSize: 13 }}>Grid — coming soon</div>;
}
```

Create `client/src/app/components/admin/portfolio/HeroTab.tsx`:

```typescript
export function HeroTab() {
  return <div style={{ color: '#aaa', fontSize: 13 }}>Hero — coming soon</div>;
}
```

Create `client/src/app/components/admin/portfolio/CategoriesTab.tsx`:

```typescript
export function CategoriesTab() {
  return <div style={{ color: '#aaa', fontSize: 13 }}>Categories — coming soon</div>;
}
```

- [ ] **Step 7: Verify build compiles**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app/client
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors. The build may have warnings but must not fail.

- [ ] **Step 8: Commit**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app
git add client/src/app/components/admin/AdminLayout.tsx \
        client/src/app/App.tsx \
        client/src/app/pages/admin/AdminPortfolio.tsx \
        client/src/app/components/admin/portfolio/
git commit -m "feat: portfolio admin route, sub-tab skeleton, AdminLayout update"
```

---

## Task 8: Frontend — LibraryTab

**Files:**
- Replace: `client/src/app/components/admin/portfolio/LibraryTab.tsx`

- [ ] **Step 1: Replace LibraryTab.tsx with full implementation**

```typescript
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
const FONT = "'Helvetica Neue', Arial, sans-serif";

interface Category {
  id: number;
  name: string;
  slug: string;
}

interface PortfolioItem {
  id: number;
  title: string;
  image_url: string;
  category_id: number | null;
  category_name: string | null;
  published: boolean;
  order: number;
  hero_slots: number[];
}

interface UploadingFile {
  file: File;
  progress: 'uploading' | 'done' | 'error';
}

export function LibraryTab() {
  const { token } = useAuth();
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterCategory, setFilterCategory] = useState<number | null>(null);
  const [filterPublished, setFilterPublished] = useState<boolean | null>(null);
  const [selectedItem, setSelectedItem] = useState<PortfolioItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<number | null>(null);
  const [editPublished, setEditPublished] = useState(false);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchItems = async () => {
    const params = new URLSearchParams();
    if (filterCategory !== null) params.set('category', String(filterCategory));
    if (filterPublished !== null) params.set('published', String(filterPublished));
    const resp = await fetch(`${API_BASE}/admin/portfolio/items/?${params}`, { headers });
    if (resp.ok) setItems(await resp.json());
  };

  const fetchCategories = async () => {
    const resp = await fetch(`${API_BASE}/admin/portfolio/categories/`, { headers });
    if (resp.ok) setCategories(await resp.json());
  };

  useEffect(() => { fetchCategories(); }, [token]);
  useEffect(() => { fetchItems(); }, [token, filterCategory, filterPublished]);

  const handleFiles = async (files: FileList) => {
    const arr = Array.from(files);
    for (const file of arr) {
      setUploading(prev => [...prev, { file, progress: 'uploading' }]);
      const formData = new FormData();
      formData.append('image', file);
      try {
        const resp = await fetch(`${API_BASE}/admin/portfolio/items/`, {
          method: 'POST',
          headers,
          body: formData,
        });
        setUploading(prev =>
          prev.map(u => u.file === file
            ? { ...u, progress: resp.ok ? 'done' : 'error' }
            : u
          )
        );
        if (resp.ok) fetchItems();
      } catch {
        setUploading(prev =>
          prev.map(u => u.file === file ? { ...u, progress: 'error' } : u)
        );
      }
    }
    // Clear done/error after 2s
    setTimeout(() => setUploading([]), 2000);
  };

  const selectItem = (item: PortfolioItem) => {
    setSelectedItem(item);
    setEditTitle(item.title);
    setEditCategory(item.category_id);
    setEditPublished(item.published);
    setConfirmDelete(false);
  };

  const saveItem = async () => {
    if (!selectedItem) return;
    setSaving(true);
    await fetch(`${API_BASE}/admin/portfolio/items/${selectedItem.id}/`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editTitle,
        category_id: editCategory,
        published: editPublished,
      }),
    });
    setSaving(false);
    await fetchItems();
    setSelectedItem(null);
  };

  const deleteItem = async () => {
    if (!selectedItem) return;
    await fetch(`${API_BASE}/admin/portfolio/items/${selectedItem.id}/`, {
      method: 'DELETE',
      headers,
    });
    setSelectedItem(null);
    setConfirmDelete(false);
    await fetchItems();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const publishedCount = items.filter(i => i.published).length;

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Stats */}
      <div style={{ fontSize: 10, color: '#aaa', marginBottom: 12, textAlign: 'right' }}>
        {items.length} photos total · {publishedCount} published
      </div>

      {/* Upload zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '1px dashed #ccc', borderRadius: 3, padding: '20px',
          textAlign: 'center', background: '#fafafa', cursor: 'pointer',
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 22, color: '#ccc', marginBottom: 6 }}>↑</div>
        <div style={{ fontSize: 12, color: '#888', fontWeight: 500 }}>
          Drop photos here or click to browse
        </div>
        <div style={{ fontSize: 10, color: '#bbb', marginTop: 3 }}>
          JPG, PNG, TIFF · Max 25 MB each · Multiple files supported
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.tiff,.tif"
          style={{ display: 'none' }}
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: 4 }}>
          Filter:
        </div>
        {[{ label: 'All', id: null }, ...categories.map(c => ({ label: c.name, id: c.id }))].map(({ label, id }) => (
          <button
            key={label}
            onClick={() => setFilterCategory(id)}
            style={{
              padding: '4px 10px',
              background: filterCategory === id ? '#111' : 'transparent',
              color: filterCategory === id ? '#fff' : '#555',
              border: filterCategory === id ? 'none' : '1px solid #e5e7eb',
              borderRadius: 2, fontSize: 10, cursor: 'pointer',
              fontFamily: FONT,
            }}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setFilterPublished(filterPublished === false ? null : false)}
          style={{
            marginLeft: 'auto', padding: '4px 10px',
            background: filterPublished === false ? '#111' : 'transparent',
            color: filterPublished === false ? '#fff' : '#888',
            border: filterPublished === false ? 'none' : '1px solid #e5e7eb',
            borderRadius: 2, fontSize: 10, cursor: 'pointer',
            fontFamily: FONT,
          }}
        >
          Unpublished only
        </button>
      </div>

      {/* Photo grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 }}>
        {/* Upload progress placeholders */}
        {uploading.map((u, i) => (
          <div key={i} style={{ opacity: 0.7 }}>
            <div style={{
              aspectRatio: '1', background: '#f3f4f6', borderRadius: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 24, height: 24, border: '2px solid #e5e7eb',
                borderTopColor: '#111', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
            <div style={{ fontSize: 9, color: '#aaa', marginTop: 3 }}>
              {u.progress === 'uploading' ? `Uploading…` : u.progress}
            </div>
          </div>
        ))}

        {/* Actual items */}
        {items.map(item => (
          <div
            key={item.id}
            onClick={() => selectItem(item)}
            style={{
              position: 'relative', cursor: 'pointer',
              opacity: item.published ? 1 : 0.6,
              outline: selectedItem?.id === item.id ? '2px solid #111' : 'none',
              borderRadius: 2,
            }}
          >
            <div style={{
              aspectRatio: '1',
              background: '#eee',
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt={item.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
            </div>
            {/* Publish dot */}
            <div style={{
              position: 'absolute', top: 5, right: 5,
              width: 10, height: 10,
              background: item.published ? '#22c55e' : '#e5e7eb',
              borderRadius: '50%', border: '1px solid #fff',
            }} />
            {/* Hero badge */}
            {item.hero_slots.length > 0 && (
              <div style={{
                position: 'absolute', top: 5, left: 5,
                background: '#111', color: '#fff',
                fontSize: 7, padding: '1px 4px',
                borderRadius: 1, fontWeight: 700,
              }}>
                HERO {item.hero_slots[0]}
              </div>
            )}
            <div style={{ fontSize: 9, color: '#555', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title || '—'}
            </div>
            <div style={{ fontSize: 9, color: '#aaa' }}>
              {item.category_name || '— no category'}
            </div>
          </div>
        ))}
      </div>

      {/* Edit strip */}
      {selectedItem && (
        <div style={{
          borderTop: '1px solid #e5e7eb', padding: '12px 0',
          display: 'flex', gap: 16, alignItems: 'center',
        }}>
          {selectedItem.image_url && (
            <img
              src={selectedItem.image_url}
              alt={selectedItem.title}
              style={{ width: 48, height: 44, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1 }}>
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              style={{
                fontSize: 11, fontWeight: 500, color: '#111',
                border: '1px solid #e5e7eb', borderRadius: 2,
                padding: '3px 6px', marginBottom: 4, width: '100%',
                fontFamily: FONT,
              }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <select
                value={editCategory ?? ''}
                onChange={e => setEditCategory(e.target.value ? Number(e.target.value) : null)}
                style={{
                  fontSize: 10, padding: '3px 6px',
                  border: '1px solid #e5e7eb', borderRadius: 2, color: '#555',
                  fontFamily: FONT,
                }}
              >
                <option value="">No category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <label style={{ fontSize: 10, color: '#555', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editPublished}
                  onChange={e => setEditPublished(e.target.checked)}
                />
                Published
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={saveItem}
              disabled={saving}
              style={{
                padding: '6px 12px', background: '#111', color: '#fff',
                border: 'none', borderRadius: 2,
                fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
                cursor: 'pointer', fontFamily: FONT,
              }}
            >
              {saving ? '…' : 'SAVE'}
            </button>
            {confirmDelete ? (
              <button
                onClick={deleteItem}
                style={{
                  padding: '6px 12px', background: '#cc3333', color: '#fff',
                  border: 'none', borderRadius: 2,
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
                  cursor: 'pointer', fontFamily: FONT,
                }}
              >
                CONFIRM DELETE
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  padding: '6px 12px', background: 'transparent', color: '#cc3333',
                  border: '1px solid #e5e7eb', borderRadius: 2,
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
                  cursor: 'pointer', fontFamily: FONT,
                }}
              >
                DELETE
              </button>
            )}
            <button
              onClick={() => { setSelectedItem(null); setConfirmDelete(false); }}
              style={{
                padding: '6px 12px', background: 'transparent', color: '#aaa',
                border: '1px solid #e5e7eb', borderRadius: 2,
                fontSize: 10, cursor: 'pointer', fontFamily: FONT,
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app/client
npm run build 2>&1 | grep -E 'error|Error' | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app
git add client/src/app/components/admin/portfolio/LibraryTab.tsx
git commit -m "feat: LibraryTab — upload zone, photo grid, edit strip"
```

---

## Task 9: Frontend — GridTab

**Files:**
- Replace: `client/src/app/components/admin/portfolio/GridTab.tsx`

- [ ] **Step 1: Replace GridTab.tsx**

```typescript
import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
const FONT = "'Helvetica Neue', Arial, sans-serif";

interface Category { id: number; name: string; slug: string; }
interface PortfolioItem {
  id: number; title: string; image_url: string;
  category_id: number | null; published: boolean; order: number;
}

export function GridTab() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch(`${API_BASE}/admin/portfolio/categories/`, { headers })
      .then(r => r.json())
      .then((cats: Category[]) => {
        setCategories(cats);
        if (cats.length > 0) setActiveCategory(cats[0].id);
      });
  }, [token]);

  useEffect(() => {
    if (activeCategory === null) return;
    fetch(`${API_BASE}/admin/portfolio/items/?category=${activeCategory}&published=true`, { headers })
      .then(r => r.json())
      .then((data: PortfolioItem[]) => setItems(data));
  }, [token, activeCategory]);

  const onDragStart = (id: number) => setDragId(id);

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setOverIndex(index);
  };

  const onDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (dragId === null) return;
    const dragIndex = items.findIndex(i => i.id === dragId);
    if (dragIndex === dropIndex) { setDragId(null); setOverIndex(null); return; }

    const reordered = [...items];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    const withOrder = reordered.map((item, i) => ({ ...item, order: i }));
    setItems(withOrder);
    setDragId(null);
    setOverIndex(null);

    await fetch(`${API_BASE}/admin/portfolio/items/reorder/`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(withOrder.map(i => ({ id: i.id, order: i.order }))),
    });
  };

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
        Drag photos to set their display order in the public gallery. Only published photos appear here.
      </div>

      {/* Category pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            style={{
              padding: '6px 14px',
              background: activeCategory === cat.id ? '#111' : 'transparent',
              color: activeCategory === cat.id ? '#fff' : '#555',
              border: activeCategory === cat.id ? 'none' : '1px solid #e5e7eb',
              borderRadius: 2, fontSize: 11, cursor: 'pointer',
              fontFamily: FONT,
            }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Draggable grid */}
      {items.length === 0 ? (
        <div style={{ color: '#bbb', fontSize: 13 }}>No published photos in this category.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {items.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => onDragStart(item.id)}
              onDragOver={e => onDragOver(e, index)}
              onDrop={e => onDrop(e, index)}
              style={{
                cursor: 'grab',
                opacity: dragId === item.id ? 0.4 : 1,
                outline: overIndex === index && dragId !== item.id ? '2px solid #111' : 'none',
                borderRadius: 2,
              }}
            >
              <div style={{ aspectRatio: '1', background: '#eee', borderRadius: 2, overflow: 'hidden' }}>
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    draggable={false}
                  />
                )}
              </div>
              <div style={{ fontSize: 9, color: '#aaa', marginTop: 3, textAlign: 'center' }}>
                #{index + 1}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app/client
npm run build 2>&1 | grep -E 'error|Error' | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app
git add client/src/app/components/admin/portfolio/GridTab.tsx
git commit -m "feat: GridTab — category pills, drag-to-reorder"
```

---

## Task 10: Frontend — HeroTab

**Files:**
- Replace: `client/src/app/components/admin/portfolio/HeroTab.tsx`

- [ ] **Step 1: Replace HeroTab.tsx**

```typescript
import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
const FONT = "'Helvetica Neue', Arial, sans-serif";

interface SlotItem { id: number; title: string; image_url: string; }
interface HeroSlot { slot_number: number; portfolio_item: SlotItem | null; }
interface LibraryItem { id: number; title: string; image_url: string; published: boolean; }

export function HeroTab() {
  const { token } = useAuth();
  const [slots, setSlots] = useState<HeroSlot[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [dragSource, setDragSource] = useState<
    { type: 'library'; itemId: number } |
    { type: 'slot'; slotNumber: number; itemId: number } |
    null
  >(null);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchSlots = async () => {
    const resp = await fetch(`${API_BASE}/admin/portfolio/hero/`, { headers });
    if (resp.ok) setSlots(await resp.json());
  };

  const fetchLibrary = async () => {
    const resp = await fetch(`${API_BASE}/admin/portfolio/items/?published=true`, { headers });
    if (resp.ok) setLibraryItems(await resp.json());
  };

  useEffect(() => { fetchSlots(); fetchLibrary(); }, [token]);

  const assignToSlot = async (slotNumber: number, itemId: number) => {
    await fetch(`${API_BASE}/admin/portfolio/hero/${slotNumber}/`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolio_item_id: itemId }),
    });
    await fetchSlots();
  };

  const clearSlot = async (slotNumber: number) => {
    await fetch(`${API_BASE}/admin/portfolio/hero/${slotNumber}/`, { method: 'DELETE', headers });
    await fetchSlots();
  };

  const onDropOnSlot = async (e: React.DragEvent, targetSlotNumber: number) => {
    e.preventDefault();
    if (!dragSource) return;
    if (dragSource.type === 'library') {
      await assignToSlot(targetSlotNumber, dragSource.itemId);
    } else {
      // Slot-to-slot move
      const sourceSlot = dragSource.slotNumber;
      const itemId = dragSource.itemId;
      await fetch(`${API_BASE}/admin/portfolio/hero/${sourceSlot}/`, { method: 'DELETE', headers });
      await assignToSlot(targetSlotNumber, itemId);
    }
    setDragSource(null);
  };

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
        Drag a photo from the strip below into a numbered slot to assign it to the hero slideshow.
      </div>

      {/* 6 slot cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 32 }}>
        {slots.map(slot => (
          <div
            key={slot.slot_number}
            onDragOver={e => e.preventDefault()}
            onDrop={e => onDropOnSlot(e, slot.slot_number)}
            style={{
              border: '1px dashed #ccc', borderRadius: 3, padding: 8,
              minHeight: 100, position: 'relative',
              background: dragSource ? '#f9fafb' : '#fff',
            }}
          >
            <div style={{
              fontSize: 9, fontWeight: 700, color: '#aaa',
              letterSpacing: '0.1em', marginBottom: 6,
            }}>
              SLOT {slot.slot_number}
            </div>
            {slot.portfolio_item ? (
              <>
                <img
                  src={slot.portfolio_item.image_url}
                  alt={slot.portfolio_item.title}
                  draggable
                  onDragStart={() => setDragSource({
                    type: 'slot',
                    slotNumber: slot.slot_number,
                    itemId: slot.portfolio_item!.id,
                  })}
                  style={{
                    width: '100%', aspectRatio: '1', objectFit: 'cover',
                    borderRadius: 2, cursor: 'grab',
                  }}
                />
                <button
                  onClick={() => clearSlot(slot.slot_number)}
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    background: '#111', color: '#fff',
                    border: 'none', borderRadius: '50%',
                    width: 16, height: 16, fontSize: 9,
                    cursor: 'pointer', lineHeight: '16px', padding: 0,
                    fontFamily: FONT,
                  }}
                >
                  ✕
                </button>
              </>
            ) : (
              <div style={{
                aspectRatio: '1', border: '1px dashed #e5e7eb',
                borderRadius: 2, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 20, color: '#e5e7eb',
              }}>
                +
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Library picker strip */}
      <div style={{
        borderTop: '1px solid #e5e7eb', paddingTop: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', letterSpacing: '0.08em', marginBottom: 12 }}>
          PUBLISHED PHOTOS — drag into a slot above
        </div>
        <div style={{
          display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8,
        }}>
          {libraryItems.map(item => (
            <div
              key={item.id}
              draggable
              onDragStart={() => setDragSource({ type: 'library', itemId: item.id })}
              style={{ flexShrink: 0, cursor: 'grab' }}
            >
              <img
                src={item.image_url}
                alt={item.title}
                draggable={false}
                style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 2 }}
              />
            </div>
          ))}
          {libraryItems.length === 0 && (
            <div style={{ color: '#bbb', fontSize: 12 }}>
              No published photos yet. Publish photos in the Library tab first.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app/client
npm run build 2>&1 | grep -E 'error|Error' | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app
git add client/src/app/components/admin/portfolio/HeroTab.tsx
git commit -m "feat: HeroTab — 6 slots, library strip, drag-to-assign"
```

---

## Task 11: Frontend — CategoriesTab

**Files:**
- Replace: `client/src/app/components/admin/portfolio/CategoriesTab.tsx`

- [ ] **Step 1: Replace CategoriesTab.tsx**

```typescript
import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
const FONT = "'Helvetica Neue', Arial, sans-serif";

interface Category {
  id: number; name: string; slug: string; order: number;
  item_count: number;
}

export function CategoriesTab() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newName, setNewName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchCategories = async () => {
    const resp = await fetch(`${API_BASE}/admin/portfolio/categories/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) setCategories(await resp.json());
  };

  useEffect(() => { fetchCategories(); }, [token]);

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
    setConfirmDeleteId(null);
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    await fetch(`${API_BASE}/admin/portfolio/categories/${id}/`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: editingName }),
    });
    setSaving(false);
    setEditingId(null);
    setEditingName('');
    await fetchCategories();
  };

  const deleteCategory = async (id: number) => {
    await fetch(`${API_BASE}/admin/portfolio/categories/${id}/`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setConfirmDeleteId(null);
    await fetchCategories();
  };

  const addCategory = async () => {
    if (!newName.trim()) return;
    await fetch(`${API_BASE}/admin/portfolio/categories/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName('');
    await fetchCategories();
  };

  const btn = (label: string, onClick: () => void, style?: React.CSSProperties) => (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', fontSize: 10, fontWeight: 600,
        letterSpacing: '0.06em', cursor: 'pointer',
        borderRadius: 2, fontFamily: FONT,
        background: 'transparent', color: '#555',
        border: '1px solid #e5e7eb',
        ...style,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ fontFamily: FONT, maxWidth: 600 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            {['Name', 'Photos', 'Actions'].map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: '6px 8px',
                fontSize: 10, fontWeight: 600, color: '#aaa',
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map(cat => (
            <tr key={cat.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '8px 8px' }}>
                {editingId === cat.id ? (
                  <input
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    autoFocus
                    style={{
                      fontSize: 12, padding: '2px 6px',
                      border: '1px solid #e5e7eb', borderRadius: 2,
                      fontFamily: FONT,
                    }}
                  />
                ) : (
                  <span>{cat.name}</span>
                )}
              </td>
              <td style={{ padding: '8px 8px', color: '#888' }}>{cat.item_count}</td>
              <td style={{ padding: '8px 8px' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {editingId === cat.id ? (
                    <>
                      {btn(saving ? '…' : 'SAVE', () => saveEdit(cat.id), { background: '#111', color: '#fff', border: 'none' })}
                      {btn('CANCEL', () => setEditingId(null))}
                    </>
                  ) : confirmDeleteId === cat.id ? (
                    <>
                      <span style={{ fontSize: 10, color: '#888', alignSelf: 'center' }}>
                        Remove category from {cat.item_count} photo{cat.item_count !== 1 ? 's' : ''}?
                      </span>
                      {btn('CONFIRM', () => deleteCategory(cat.id), { color: '#cc3333', borderColor: '#cc3333' })}
                      {btn('CANCEL', () => setConfirmDeleteId(null))}
                    </>
                  ) : (
                    <>
                      {btn('RENAME', () => startEdit(cat))}
                      {btn('DELETE', () => setConfirmDeleteId(cat.id), { color: '#cc3333' })}
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Add new category */}
      <div style={{ display: 'flex', gap: 8, marginTop: 20, alignItems: 'center' }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCategory()}
          placeholder="New category name…"
          style={{
            fontSize: 12, padding: '6px 10px',
            border: '1px solid #e5e7eb', borderRadius: 2,
            fontFamily: FONT, flex: 1,
          }}
        />
        <button
          onClick={addCategory}
          style={{
            padding: '6px 14px', background: '#111', color: '#fff',
            border: 'none', borderRadius: 2,
            fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
            cursor: 'pointer', fontFamily: FONT,
          }}
        >
          ADD
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app/client
npm run build 2>&1 | grep -E 'error|Error' | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app
git add client/src/app/components/admin/portfolio/CategoriesTab.tsx
git commit -m "feat: CategoriesTab — inline rename, add, delete with confirmation"
```

---

## Task 12: Frontend — Update Portfolio.tsx and Hero.tsx

**Files:**
- Modify: `client/src/app/components/Portfolio.tsx`
- Modify: `client/src/app/components/Hero.tsx`

- [ ] **Step 1: Read current Portfolio.tsx**

Read `client/src/app/components/Portfolio.tsx`. Note the `BASE_URL`, `PLACEHOLDERS`, `CATEGORIES` constants, and the GSAP animation code.

- [ ] **Step 2: Update Portfolio.tsx**

The public Portfolio component needs to:
1. Fetch categories from `GET /api/portfolio/categories/`
2. Fetch items from `GET /api/portfolio/` (optionally filtered by `?category=<slug>`)
3. Show empty state if both return empty arrays

Replace the `PLACEHOLDERS`, `CATEGORIES` constants and their usages. Keep all GSAP animation logic and the filter pill UI — just swap hardcoded data for API data.

Key changes:

```typescript
// Replace CATEGORIES and PLACEHOLDERS constants with:
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';

interface PublicCategory { id: number; name: string; slug: string; published_count: number; }
interface PublicItem { id: number; title: string; image_url: string; category_name: string; category_slug: string; order: number; }

// Inside the component, add state:
const [apiCategories, setApiCategories] = useState<PublicCategory[]>([]);
const [apiItems, setApiItems] = useState<PublicItem[]>([]);
const [activeCategory, setActiveCategory] = useState<string>('all');

// Fetch on mount:
useEffect(() => {
  fetch(`${BASE_URL}/portfolio/categories/`).then(r => r.json()).then(setApiCategories).catch(() => {});
}, []);

useEffect(() => {
  const params = activeCategory !== 'all' ? `?category=${activeCategory}` : '';
  fetch(`${BASE_URL}/portfolio/${params}`).then(r => r.json()).then(setApiItems).catch(() => {});
}, [activeCategory]);

// Replace the filter pills to use apiCategories:
// ['All', ...apiCategories.map(c => c.name)] → active check: activeCategory === 'all' or activeCategory === c.slug

// Replace the items grid to use apiItems:
// Map apiItems to display. If apiItems is empty, show:
// <div style={{ color: '#888', fontSize: 14, textAlign: 'center', padding: 40 }}>
//   Portfolio coming soon
// </div>

// Remove the `featured` field reference from the PortfolioItem interface.
// Remove the PLACEHOLDERS fallback logic.
```

Make the minimal changes necessary — preserve all existing GSAP animations, layout, and styling. Only replace the data source and the empty state.

- [ ] **Step 3: Read current Hero.tsx**

Read `client/src/app/components/Hero.tsx`. Note the `SLIDES` constant and GSAP animation logic using `slideRefs`.

- [ ] **Step 4: Update Hero.tsx**

Replace `SLIDES` with API data. Keep all GSAP animation code intact.

```typescript
// Replace SLIDES constant with API state:
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';

interface HeroSlide { slot_number: number; image_url: string; title: string; }

// Inside component:
const [slides, setSlides] = useState<HeroSlide[]>([]);

useEffect(() => {
  fetch(`${BASE_URL}/portfolio/hero/`)
    .then(r => r.json())
    .then((data: HeroSlide[]) => {
      if (data.length === 0) {
        // Fallback: single solid-colour slide (no broken images)
        setSlides([{ slot_number: 0, image_url: '', title: '' }]);
      } else {
        setSlides(data);
      }
    })
    .catch(() => {
      setSlides([{ slot_number: 0, image_url: '', title: '' }]);
    });
}, []);

// Replace all SLIDES references with `slides`.
// Where SLIDES[i].url was used, use slides[i]?.image_url.
// Where SLIDES[i].caption was used, use slides[i]?.title.
// The fallback slide (image_url='') should render as a solid background colour — use:
// background: slide.image_url ? `url(${slide.image_url})` : '#1a1a1a'
// backgroundSize: 'cover', backgroundPosition: 'center'
// instead of an <img> tag if that's the current pattern.
```

Preserve: `slideRefs`, `gsap.to(...)` calls, dot indicators, `goTo()`, auto-advance `setInterval`.

- [ ] **Step 5: Build check**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app/client
npm run build 2>&1 | grep -E 'error|Error' | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app
git add client/src/app/components/Portfolio.tsx client/src/app/components/Hero.tsx
git commit -m "feat: Portfolio and Hero fetch from API, empty state fallback"
```

---

## Task 13: Manual Smoke Test

This task has no automated tests. Run through each scenario manually.

- [ ] **Step 1: Start the dev stack**

Terminal 1:
```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app/server
redis-server &
daphne -b 0.0.0.0 -p 8000 K_app.asgi:application
```

Terminal 2:
```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app/client
npm run dev
```

- [ ] **Step 2: Smoke test — Categories**

1. Log in as staff at `http://localhost:5173/admin`
2. Navigate to Portfolio → Categories
3. Add a category "Wedding" → verify it appears in the list
4. Rename it to "Weddings" → verify slug changed in list
5. Add "Portrait" category
6. Delete "Weddings" with 0 photos → verify it disappears

- [ ] **Step 3: Smoke test — Library**

1. Navigate to Portfolio → Library
2. Drag a JPG file into the upload zone → verify it appears in the grid as unpublished (grey dot)
3. Upload a GIF → verify a 400 error response (file should not appear)
4. Click the photo → edit strip appears at bottom
5. Assign it to "Portrait", toggle Published, click SAVE
6. Verify the photo now shows a green dot and "Portrait" label
7. Upload a second photo, click it, click DELETE, confirm → photo disappears

- [ ] **Step 4: Smoke test — Grid**

1. Navigate to Portfolio → Grid
2. Click "Portrait" pill → published Portrait photos appear
3. Drag photo 1 after photo 2 → order changes
4. Reload the page → order persists (verify `order` field was saved)

- [ ] **Step 5: Smoke test — Hero**

1. Navigate to Portfolio → Hero
2. Drag a photo from the strip into Slot 1 → slot card shows the photo
3. Drag another photo into Slot 1 → old photo replaced
4. Drag the photo from Slot 1 into Slot 2 → Slot 1 becomes empty, Slot 2 gets the photo
5. Click ✕ on Slot 2 → slot becomes empty dashed placeholder

- [ ] **Step 6: Smoke test — Public pages**

1. Navigate to `http://localhost:5173/` → Hero slideshow shows API photos (not Unsplash placeholders)
2. Navigate to `http://localhost:5173/portfolio` → Published photos appear in the grid
3. Click "Portrait" filter pill → only Portrait photos shown
4. Unpublish all photos in Library → public grid shows "Portfolio coming soon" message

- [ ] **Step 7: Final commit**

```bash
cd /Users/javiermacias/Desktop/Proyecto\ K/K_app
git add -A
git commit -m "chore: portfolio admin feature complete — smoke tests passed"
```
