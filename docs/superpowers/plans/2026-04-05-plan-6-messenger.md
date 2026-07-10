# Messenger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time per-product messaging system between Kay and customers, with live unread badge in the header, accessible from `/messages` (customers) and `/admin/messages` (Kay).

**Architecture:** Django Channels + Redis provides WebSocket transport; two consumers — `ChatConsumer` (per thread) and `NotificationConsumer` (per user) — handle message delivery and unread badge pushes. The frontend uses a `NotificationContext` for the global badge, a `useChat` hook for per-thread WS, and shared `ThreadList`/`ChatPanel` components used by both the customer page and the admin page.

**Tech Stack:** Django Channels 4, channels-redis 4, daphne 4, djangorestframework-simplejwt (already installed), React context + hooks, TypeScript.

---

## File Map

**New backend files:**
- `server/content/consumers.py` — `ChatConsumer` and `NotificationConsumer`

**Modified backend files:**
- `server/requirements.txt` — add channels, channels-redis, daphne
- `server/backend/settings.py` — add daphne/channels to INSTALLED_APPS, add CHANNEL_LAYERS
- `server/backend/asgi.py` — route HTTP → Django, WebSocket → Channels URLRouter
- `server/content/models.py` — rename `is_read` → `read_by_recipient` on `Message`
- `server/content/views.py` — add 4 message API views (threads, list, send, mark-read)
- `server/content/urls.py` — register new message routes
- `server/content/tests.py` — add MessageModelTests, MessageAPITests, WebSocketTests
- `server/content/migrations/` — auto-generated migration for field rename

**New frontend files:**
- `client/src/app/context/NotificationContext.tsx` — global unread count provider
- `client/src/app/hooks/useNotifications.ts` — personal WS for badge
- `client/src/app/hooks/useChat.ts` — per-thread WS + mark-read
- `client/src/app/components/ThreadList.tsx` — sidebar (grouped customer / flat admin)
- `client/src/app/components/ChatPanel.tsx` — chat panel (header, auto-opener, messages, input)
- `client/src/app/pages/MessagesPage.tsx` — customer messenger page
- `client/src/app/pages/admin/AdminMessages.tsx` — admin inbox page

**Modified frontend files:**
- `client/src/app/components/Header.tsx` — add Messages link + unread badge (logged-in only)
- `client/src/app/components/admin/AdminLayout.tsx` — add Messages tab + badge; update AdminTab type
- `client/src/app/App.tsx` — wrap in NotificationContext; replace /messages placeholder; add /admin/messages route

---

## Task 1: Infrastructure — packages, settings, asgi.py

**Files:**
- Modify: `server/requirements.txt`
- Modify: `server/backend/settings.py`
- Modify: `server/backend/asgi.py`

- [ ] **Step 1: Add packages to requirements.txt**

Open `server/requirements.txt` and add these three lines (after the existing entries):

```
channels==4.2.2
channels-redis==4.2.1
daphne==4.1.2
```

- [ ] **Step 2: Install the packages**

```bash
cd server
pip install channels==4.2.2 channels-redis==4.2.1 daphne==4.1.2
```

Expected: all three install without errors.

- [ ] **Step 3: Update INSTALLED_APPS in settings.py**

In `server/backend/settings.py`, replace:

```python
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'accounts',
    'packages',
    'payments',
    'content',
]
```

with:

```python
INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'channels',
    'accounts',
    'packages',
    'payments',
    'content',
]
```

Note: `daphne` must be first in INSTALLED_APPS so it overrides the default `runserver` with the ASGI version.

- [ ] **Step 4: Add CHANNEL_LAYERS and ASGI_APPLICATION to settings.py**

At the end of `server/backend/settings.py`, add:

```python
# --- Django Channels ---
ASGI_APPLICATION = 'backend.asgi.application'

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [env('REDIS_URL', default='redis://localhost:6379')],
        },
    },
}
```

- [ ] **Step 5: Update asgi.py**

Replace the entire contents of `server/backend/asgi.py` with:

```python
import os

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.urls import re_path

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

django_asgi_app = get_asgi_application()

# Import consumers after Django setup to avoid AppRegistryNotReady
from content.consumers import ChatConsumer, NotificationConsumer  # noqa: E402

websocket_urlpatterns = [
    re_path(r'^ws/chat/(?P<thread_type>booking|editing)/(?P<thread_id>\d+)/$', ChatConsumer.as_asgi()),
    re_path(r'^ws/notifications/$', NotificationConsumer.as_asgi()),
]

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': AllowedHostsOriginValidator(
        URLRouter(websocket_urlpatterns)
    ),
})
```

- [ ] **Step 6: Verify Django still starts**

```bash
cd server
python manage.py check
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 7: Commit**

```bash
cd server
git add requirements.txt backend/settings.py backend/asgi.py
git commit -m "feat: add Django Channels + Redis infrastructure"
```

---

## Task 2: Model migration — rename is_read to read_by_recipient

**Files:**
- Modify: `server/content/models.py`
- Create: `server/content/migrations/0005_rename_is_read_message_read_by_recipient.py` (auto-generated)
- Modify: `server/content/tests.py`

- [ ] **Step 1: Write a failing test**

In `server/content/tests.py`, find the `ModelSmokeTests` class and add this test method:

```python
def test_message_read_by_recipient_default_false(self):
    booking = BookingRequest.objects.create(
        customer=self.user,
        session_type='portrait',
        location='Oxford',
        postcode='OX1 1AA',
    )
    msg = Message.objects.create(
        thread_type='booking',
        thread_id=booking.id,
        sender=self.user,
        body='Hello',
    )
    self.assertFalse(msg.read_by_recipient)
    self.assertFalse(hasattr(msg, 'is_read'))
```

- [ ] **Step 2: Run the test — expect failure**

```bash
cd server
python manage.py test content.tests.ModelSmokeTests.test_message_read_by_recipient_default_false -v 2
```

Expected: FAIL — `AttributeError: 'Message' object has no attribute 'read_by_recipient'`

- [ ] **Step 3: Update the Message model**

In `server/content/models.py`, find the `Message` class and replace the `is_read` field:

```python
class Message(models.Model):
    THREAD_TYPES = [
        ('booking', 'Booking'),
        ('editing', 'Editing'),
    ]
    thread_type = models.CharField(max_length=20, choices=THREAD_TYPES)
    thread_id = models.PositiveBigIntegerField()
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='messages')
    body = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    read_by_recipient = models.BooleanField(default=False)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f"{self.thread_type}#{self.thread_id} from {self.sender.email}"
```

- [ ] **Step 4: Generate the migration**

```bash
cd server
python manage.py makemigrations content --name rename_is_read_message_read_by_recipient
```

Expected: Creates `content/migrations/0005_rename_is_read_message_read_by_recipient.py`.

Open the generated file and verify it uses `RenameField` (not AddField+RemoveField). Django auto-detects renames when the only change is the field name. If it generated AddField+RemoveField instead, replace the migration file contents with:

```python
from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ('content', '0004_availabilityslot_editable_max_length'),
    ]
    operations = [
        migrations.RenameField(
            model_name='message',
            old_name='is_read',
            new_name='read_by_recipient',
        ),
    ]
```

- [ ] **Step 5: Apply the migration**

```bash
cd server
python manage.py migrate
```

Expected: `Applying content.0005_rename_is_read_message_read_by_recipient... OK`

- [ ] **Step 6: Run the test — expect pass**

```bash
cd server
python manage.py test content.tests.ModelSmokeTests.test_message_read_by_recipient_default_false -v 2
```

Expected: OK

- [ ] **Step 7: Run all existing tests — none should break**

```bash
cd server
python manage.py test -v 2
```

Expected: All previously passing tests still pass. (The existing `test_message_creation` test in `ModelSmokeTests` does not reference `is_read`, so it should be fine. If it does reference `is_read`, update it to use `read_by_recipient`.)

- [ ] **Step 8: Commit**

```bash
cd server
git add content/models.py content/migrations/ content/tests.py
git commit -m "feat: rename Message.is_read to read_by_recipient"
```

---

## Task 3: REST API — threads, list, send, mark-read

**Files:**
- Modify: `server/content/views.py`
- Modify: `server/content/urls.py`
- Modify: `server/content/tests.py`

**Background:** The four new endpoints are all under `/api/messages/`. Customers see only their own threads. Kay (staff) sees all. GET /api/messages/ returns messages for a thread without marking them read. POST /api/messages/read/ marks all in a thread as read. A system message (auto-opener) is prepended to the message list — it is derived from the linked request, not stored.

- [ ] **Step 1: Write failing tests**

In `server/content/tests.py`, add a new test class after `ModelSmokeTests`:

```python
class MessageAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.customer = User.objects.create_user(
            username='cust@example.com', email='cust@example.com', password='pass'
        )
        self.other_customer = User.objects.create_user(
            username='other@example.com', email='other@example.com', password='pass'
        )
        self.staff = User.objects.create_user(
            username='staff@example.com', email='staff@example.com', password='pass',
            is_staff=True
        )
        self.editing = EditingRequest.objects.create(
            customer=self.customer,
            style_notes='warm tones, natural light',
            turnaround='2 weeks',
        )
        self.booking = BookingRequest.objects.create(
            customer=self.customer,
            session_type='portrait',
            location='Christchurch Meadow',
            postcode='OX1 1DP',
        )

    def _token(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        return str(RefreshToken.for_user(user).access_token)

    def test_threads_requires_auth(self):
        resp = self.client.get('/api/messages/threads/')
        self.assertEqual(resp.status_code, 401)

    def test_customer_threads_returns_grouped_structure(self):
        Message.objects.create(
            thread_type='editing', thread_id=self.editing.id,
            sender=self.staff, body='Hello', read_by_recipient=False
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.customer)}')
        resp = self.client.get('/api/messages/threads/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn('editing', data)
        self.assertIn('booking', data)
        thread = data['editing'][0]
        self.assertEqual(thread['thread_id'], self.editing.id)
        self.assertEqual(thread['unread_count'], 1)
        self.assertIn('subject', thread)
        self.assertIn('last_message_body', thread)

    def test_staff_threads_returns_flat_list(self):
        Message.objects.create(
            thread_type='editing', thread_id=self.editing.id,
            sender=self.customer, body='Hi Kay', read_by_recipient=False
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.staff)}')
        resp = self.client.get('/api/messages/threads/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsInstance(data, list)
        self.assertEqual(data[0]['thread_type'], 'editing')
        self.assertEqual(data[0]['thread_id'], self.editing.id)
        self.assertIn('customer_email', data[0])

    def test_customer_cannot_read_other_customers_thread(self):
        other_editing = EditingRequest.objects.create(
            customer=self.other_customer,
            style_notes='B&W', turnaround='1 week',
        )
        Message.objects.create(
            thread_type='editing', thread_id=other_editing.id,
            sender=self.staff, body='Private', read_by_recipient=False
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.customer)}')
        resp = self.client.get(f'/api/messages/?thread_type=editing&thread_id={other_editing.id}')
        self.assertEqual(resp.status_code, 403)

    def test_send_message_creates_db_row(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.customer)}')
        resp = self.client.post('/api/messages/', {
            'thread_type': 'editing',
            'thread_id': self.editing.id,
            'body': 'Looking good!',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(Message.objects.filter(body='Looking good!').exists())

    def test_send_message_empty_body_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.customer)}')
        resp = self.client.post('/api/messages/', {
            'thread_type': 'editing',
            'thread_id': self.editing.id,
            'body': '   ',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_mark_read_marks_correct_messages(self):
        # Staff sends 2 messages to customer
        m1 = Message.objects.create(
            thread_type='editing', thread_id=self.editing.id,
            sender=self.staff, body='A', read_by_recipient=False
        )
        m2 = Message.objects.create(
            thread_type='editing', thread_id=self.editing.id,
            sender=self.staff, body='B', read_by_recipient=False
        )
        # Other thread — should not be touched
        other_editing = EditingRequest.objects.create(
            customer=self.customer, style_notes='Other', turnaround='1w'
        )
        m3 = Message.objects.create(
            thread_type='editing', thread_id=other_editing.id,
            sender=self.staff, body='C', read_by_recipient=False
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.customer)}')
        resp = self.client.post('/api/messages/read/', {
            'thread_type': 'editing',
            'thread_id': self.editing.id,
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        m1.refresh_from_db(); m2.refresh_from_db(); m3.refresh_from_db()
        self.assertTrue(m1.read_by_recipient)
        self.assertTrue(m2.read_by_recipient)
        self.assertFalse(m3.read_by_recipient)  # different thread, untouched

    def test_message_list_includes_system_message(self):
        Message.objects.create(
            thread_type='editing', thread_id=self.editing.id,
            sender=self.staff, body='Hi', read_by_recipient=False
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.customer)}')
        resp = self.client.get(f'/api/messages/?thread_type=editing&thread_id={self.editing.id}')
        self.assertEqual(resp.status_code, 200)
        messages = resp.json()
        self.assertTrue(messages[0]['is_system'])

    def test_staff_can_read_any_thread(self):
        Message.objects.create(
            thread_type='editing', thread_id=self.editing.id,
            sender=self.customer, body='Hello Kay', read_by_recipient=False
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.staff)}')
        resp = self.client.get(f'/api/messages/?thread_type=editing&thread_id={self.editing.id}')
        self.assertEqual(resp.status_code, 200)
```

- [ ] **Step 2: Run the tests — expect failures**

```bash
cd server
python manage.py test content.tests.MessageAPITests -v 2
```

Expected: All fail with 404 (routes don't exist yet).

- [ ] **Step 3: Add message views to views.py**

At the end of `server/content/views.py`, add the following four views. Add this import at the top of the file alongside existing imports:

```python
from django.db.models import Max
```

Then append these views at the end of the file:

```python
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
            slot_date = req.slot.date.isoformat() if req.slot else 'TBC'
            slot_block = req.slot.block if req.slot else ''
            body = (
                f"Booking Request #{req.id} — {req.session_type.capitalize()} at "
                f"{req.location} ({req.postcode}). Date: {slot_date} {slot_block}."
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
    user = request.user

    if user.is_staff:
        # Flat list: all threads with messages, sorted by last message time desc
        from django.db.models import Max
        thread_qs = (
            Message.objects
            .values('thread_type', 'thread_id')
            .annotate(last_message_at=Max('timestamp'))
            .order_by('-last_message_at')
        )
        result = []
        for row in thread_qs:
            tt = row['thread_type']
            tid = row['thread_id']
            last_msg = Message.objects.filter(thread_type=tt, thread_id=tid).order_by('-timestamp').first()
            unread = Message.objects.filter(
                thread_type=tt, thread_id=tid, read_by_recipient=False
            ).exclude(sender=user).count()
            # Determine customer
            customer_email = ''
            if tt == 'editing':
                try:
                    customer_email = EditingRequest.objects.get(pk=tid).customer.email
                except EditingRequest.DoesNotExist:
                    customer_email = 'unknown'
            else:
                try:
                    customer_email = BookingRequest.objects.get(pk=tid).customer.email
                except BookingRequest.DoesNotExist:
                    customer_email = 'unknown'
            result.append({
                'thread_type': tt,
                'thread_id': tid,
                'customer_email': customer_email,
                'subject': _thread_subject(tt, tid),
                'last_message_body': last_msg.body if last_msg else '',
                'last_message_at': last_msg.timestamp.isoformat() if last_msg else None,
                'unread_count': unread,
            })
        return Response(result)

    else:
        # Grouped by type: only the customer's own threads
        result = {'editing': [], 'booking': []}
        for tt in ('editing', 'booking'):
            # Get all thread_ids for this customer
            if tt == 'editing':
                owned_ids = list(EditingRequest.objects.filter(customer=user).values_list('id', flat=True))
            else:
                owned_ids = list(BookingRequest.objects.filter(customer=user).values_list('id', flat=True))

            thread_qs = (
                Message.objects
                .filter(thread_type=tt, thread_id__in=owned_ids)
                .values('thread_id')
                .annotate(last_message_at=Max('timestamp'))
                .order_by('-last_message_at')
            )
            for row in thread_qs:
                tid = row['thread_id']
                last_msg = Message.objects.filter(thread_type=tt, thread_id=tid).order_by('-timestamp').first()
                unread = Message.objects.filter(
                    thread_type=tt, thread_id=tid, read_by_recipient=False
                ).exclude(sender=user).count()
                result[tt].append({
                    'thread_id': tid,
                    'subject': _thread_subject(tt, tid),
                    'last_message_body': last_msg.body if last_msg else '',
                    'last_message_at': last_msg.timestamp.isoformat() if last_msg else None,
                    'unread_count': unread,
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

    try:
        thread_id = int(thread_id)
    except (ValueError, TypeError):
        return Response({'error': 'thread_id must be an integer.'}, status=400)

    # Access control
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

    # Access control
    if not request.user.is_staff:
        if not _user_owns_thread(request.user, thread_type, thread_id):
            return Response({'error': 'Access denied.'}, status=403)

    # Mark all messages NOT sent by this user as read (i.e. mark what the recipient has now read)
    Message.objects.filter(
        thread_type=thread_type,
        thread_id=thread_id,
        read_by_recipient=False,
    ).exclude(sender=request.user).update(read_by_recipient=True)

    return Response({'status': 'ok'})
```

- [ ] **Step 4: Register routes in urls.py**

In `server/content/urls.py`, add these imports and URL patterns:

```python
from django.urls import path
from . import views

urlpatterns = [
    path('service-area/', views.service_area_detail),
    path('service-area/check/', views.service_area_check),
    path('availability/', views.customer_availability),
    path('portfolio/', views.portfolio_list),
    path('bookings/', views.create_booking),
    path('editing-requests/',                views.create_editing_request),
    path('editing-requests/<int:pk>/files/', views.upload_editing_file),

    # Message endpoints
    path('messages/threads/', views.message_threads),
    path('messages/', views.message_list),
    path('messages/send/', views.send_message),
    path('messages/read/', views.mark_thread_read),

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
```

Note: `messages/send/` and `messages/read/` must come BEFORE `messages/` (which has no trailing path segment) to avoid Django routing `send/` as a thread_id query. Actually, since `messages/` is a GET-only view that uses query params (not URL segments), and `messages/send/` and `messages/read/` are separate paths, order doesn't matter — but keeping specific paths first is good practice.

- [ ] **Step 5: Run the tests — expect pass**

```bash
cd server
python manage.py test content.tests.MessageAPITests -v 2
```

Expected: All 9 tests pass.

- [ ] **Step 6: Run all tests**

```bash
cd server
python manage.py test -v 2
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
cd server
git add content/views.py content/urls.py content/tests.py
git commit -m "feat: add message REST API (threads, list, send, mark-read)"
```

---

## Task 4: WebSocket consumers — ChatConsumer and NotificationConsumer

**Files:**
- Create: `server/content/consumers.py`
- Modify: `server/content/tests.py`

**Background:** `ChatConsumer` handles per-thread chat. It validates the JWT from the `?token=` query param, checks thread ownership, and broadcasts messages to the channel group `chat_{thread_type}_{thread_id}`. It also pushes an updated unread count to the recipient's personal channel group `user_{recipient_id}` whenever a message is created. `NotificationConsumer` handles the personal notification channel — it sends the current unread count on connect and accepts server-push frames only.

- [ ] **Step 1: Write failing WebSocket tests**

In `server/content/tests.py`, add this import at the top of the file:

```python
from channels.testing import WebsocketCommunicator
from channels.db import database_sync_to_async
```

Then add a new test class at the end:

```python
class WebSocketTests(TestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            username='ws_cust@example.com', email='ws_cust@example.com', password='pass'
        )
        self.staff = User.objects.create_user(
            username='ws_staff@example.com', email='ws_staff@example.com', password='pass',
            is_staff=True
        )
        self.editing = EditingRequest.objects.create(
            customer=self.customer,
            style_notes='test',
            turnaround='1 week',
        )

    def _token(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        return str(RefreshToken.for_user(user).access_token)

    async def test_chat_connect_valid_jwt(self):
        from backend.asgi import application
        token = self._token(self.customer)
        communicator = WebsocketCommunicator(
            application,
            f'/ws/chat/editing/{self.editing.id}/?token={token}'
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.disconnect()

    async def test_chat_connect_invalid_jwt_rejected(self):
        from backend.asgi import application
        communicator = WebsocketCommunicator(
            application,
            f'/ws/chat/editing/{self.editing.id}/?token=invalid_token'
        )
        connected, code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(code, 4003)

    async def test_chat_unauthorized_thread_rejected(self):
        """Customer cannot connect to another customer's thread."""
        from backend.asgi import application
        other_customer = await database_sync_to_async(User.objects.create_user)(
            username='other_ws@example.com', email='other_ws@example.com', password='pass'
        )
        other_editing = await database_sync_to_async(EditingRequest.objects.create)(
            customer=other_customer, style_notes='private', turnaround='1w'
        )
        token = self._token(self.customer)
        communicator = WebsocketCommunicator(
            application,
            f'/ws/chat/editing/{other_editing.id}/?token={token}'
        )
        connected, code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(code, 4003)

    async def test_notification_connect_valid_jwt(self):
        from backend.asgi import application
        token = self._token(self.customer)
        communicator = WebsocketCommunicator(
            application,
            f'/ws/notifications/?token={token}'
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        # Should immediately receive current unread count
        response = await communicator.receive_json_from()
        self.assertEqual(response['type'], 'unread_count')
        self.assertIn('count', response)
        await communicator.disconnect()

    async def test_notification_connect_invalid_jwt_rejected(self):
        from backend.asgi import application
        communicator = WebsocketCommunicator(
            application,
            '/ws/notifications/?token=bad'
        )
        connected, code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(code, 4003)
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd server
python manage.py test content.tests.WebSocketTests -v 2
```

Expected: ImportError or FAIL — `consumers.py` doesn't exist yet.

- [ ] **Step 3: Create consumers.py**

Create `server/content/consumers.py` with the following content:

```python
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from .models import Message, EditingRequest, BookingRequest


async def _authenticate_token(token_str):
    """Validate JWT and return User or None."""
    try:
        token = AccessToken(token_str)
        user_id = token['user_id']
        user = await database_sync_to_async(User.objects.get)(pk=user_id)
        return user
    except (InvalidToken, TokenError, User.DoesNotExist, KeyError):
        return None


@database_sync_to_async
def _user_owns_thread(user, thread_type, thread_id):
    if thread_type == 'editing':
        return EditingRequest.objects.filter(pk=thread_id, customer=user).exists()
    else:
        return BookingRequest.objects.filter(pk=thread_id, customer=user).exists()


@database_sync_to_async
def _get_thread_customer_id(thread_type, thread_id):
    """Return the customer user_id for a thread, or None if not found."""
    try:
        if thread_type == 'editing':
            return EditingRequest.objects.get(pk=thread_id).customer_id
        else:
            return BookingRequest.objects.get(pk=thread_id).customer_id
    except (EditingRequest.DoesNotExist, BookingRequest.DoesNotExist):
        return None


@database_sync_to_async
def _create_message(thread_type, thread_id, sender, body):
    return Message.objects.create(
        thread_type=thread_type,
        thread_id=thread_id,
        sender=sender,
        body=body,
    )


@database_sync_to_async
def _get_unread_count(user_id):
    """Total unread messages for a user across all threads."""
    user = User.objects.get(pk=user_id)
    if user.is_staff:
        # Messages from non-staff (customers) that haven't been read by staff
        return Message.objects.filter(
            read_by_recipient=False
        ).exclude(sender__is_staff=True).count()
    else:
        # Messages not sent by this user that are unread (staff → customer)
        return Message.objects.filter(
            read_by_recipient=False
        ).exclude(sender_id=user_id).filter(
            # Only count messages in threads this user owns
            thread_id__in=list(
                EditingRequest.objects.filter(customer_id=user_id).values_list('id', flat=True)
            )
        ).filter(thread_type='editing').count() + \
        Message.objects.filter(
            read_by_recipient=False
        ).exclude(sender_id=user_id).filter(
            thread_id__in=list(
                BookingRequest.objects.filter(customer_id=user_id).values_list('id', flat=True)
            )
        ).filter(thread_type='booking').count()


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.thread_type = self.scope['url_route']['kwargs']['thread_type']
        self.thread_id = int(self.scope['url_route']['kwargs']['thread_id'])
        self.room_group = f"chat_{self.thread_type}_{self.thread_id}"

        # Authenticate
        query_string = self.scope.get('query_string', b'').decode()
        token_str = None
        for part in query_string.split('&'):
            if part.startswith('token='):
                token_str = part[6:]
                break

        if not token_str:
            await self.close(code=4003)
            return

        user = await _authenticate_token(token_str)
        if user is None:
            await self.close(code=4003)
            return

        # Authorise: staff can access any thread; customers only their own
        if not user.is_staff:
            owns = await _user_owns_thread(user, self.thread_type, self.thread_id)
            if not owns:
                await self.close(code=4003)
                return

        self.user = user
        await self.channel_layer.group_add(self.room_group, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group'):
            await self.channel_layer.group_discard(self.room_group, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        body = data.get('body', '').strip()
        if not body:
            return

        # Save to DB
        msg = await _create_message(self.thread_type, self.thread_id, self.user, body)

        # Broadcast to thread group
        await self.channel_layer.group_send(
            self.room_group,
            {
                'type': 'chat_message',
                'message': {
                    'id': msg.id,
                    'sender_email': self.user.email,
                    'body': msg.body,
                    'timestamp': msg.timestamp.isoformat(),
                    'sender_id': self.user.id,
                },
            }
        )

        # Push updated unread count to recipient's notification channel
        recipient_id = None
        if self.user.is_staff:
            # Recipient is the customer
            recipient_id = await _get_thread_customer_id(self.thread_type, self.thread_id)
        else:
            # Recipient is staff — find any staff user_id to notify
            # We push to a generic staff notifications group
            staff_unread = await _get_unread_count_for_staff()
            await self.channel_layer.group_send(
                'staff_notifications',
                {'type': 'unread_count_update', 'count': staff_unread}
            )

        if recipient_id:
            unread = await _get_unread_count(recipient_id)
            await self.channel_layer.group_send(
                f'user_{recipient_id}',
                {'type': 'unread_count_update', 'count': unread}
            )

    async def chat_message(self, event):
        msg = event['message']
        await self.send(text_data=json.dumps({
            'type': 'message',
            'message': {
                'id': msg['id'],
                'sender_email': msg['sender_email'],
                'body': msg['body'],
                'timestamp': msg['timestamp'],
                'is_own': msg['sender_id'] == self.user.id,
            }
        }))

    async def unread_count_update(self, event):
        """Receive an unread count update pushed from another consumer."""
        await self.send(text_data=json.dumps({
            'type': 'unread_count',
            'count': event['count'],
        }))


@database_sync_to_async
def _get_unread_count_for_staff():
    return Message.objects.filter(
        read_by_recipient=False
    ).exclude(sender__is_staff=True).count()


class NotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Authenticate
        query_string = self.scope.get('query_string', b'').decode()
        token_str = None
        for part in query_string.split('&'):
            if part.startswith('token='):
                token_str = part[6:]
                break

        if not token_str:
            await self.close(code=4003)
            return

        user = await _authenticate_token(token_str)
        if user is None:
            await self.close(code=4003)
            return

        self.user = user
        self.personal_group = f'user_{user.id}'

        # Staff also join a shared staff_notifications group
        if user.is_staff:
            await self.channel_layer.group_add('staff_notifications', self.channel_name)

        await self.channel_layer.group_add(self.personal_group, self.channel_name)
        await self.accept()

        # Send current unread count immediately on connect
        count = await _get_unread_count(user.id)
        await self.send(text_data=json.dumps({'type': 'unread_count', 'count': count}))

    async def disconnect(self, close_code):
        if hasattr(self, 'personal_group'):
            await self.channel_layer.group_discard(self.personal_group, self.channel_name)
        if hasattr(self, 'user') and self.user.is_staff:
            await self.channel_layer.group_discard('staff_notifications', self.channel_name)

    async def receive(self, text_data):
        # No client→server messages expected on notification consumer
        pass

    async def unread_count_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'unread_count',
            'count': event['count'],
        }))
```

- [ ] **Step 4: Run WebSocket tests — expect pass**

Note: WebSocket tests require Redis to be running locally. Start Redis first:

```bash
redis-server --daemonize yes
```

Then run:

```bash
cd server
python manage.py test content.tests.WebSocketTests -v 2
```

Expected: All 5 WebSocket tests pass.

- [ ] **Step 5: Run all tests**

```bash
cd server
python manage.py test -v 2
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd server
git add content/consumers.py content/tests.py
git commit -m "feat: add ChatConsumer and NotificationConsumer for WebSocket messaging"
```

---

## Task 5: Also update mark_thread_read to push notification

**Files:**
- Modify: `server/content/views.py`

The `mark_thread_read` REST endpoint changes unread counts but doesn't push a badge update via WebSocket. Add the push there too so the badge updates live when the user opens a thread.

- [ ] **Step 1: Update mark_thread_read in views.py**

Replace the `mark_thread_read` view (already added in Task 3) with this version that also pushes to the notification channel:

```python
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

    # Access control
    if not request.user.is_staff:
        if not _user_owns_thread(request.user, thread_type, thread_id):
            return Response({'error': 'Access denied.'}, status=403)

    Message.objects.filter(
        thread_type=thread_type,
        thread_id=thread_id,
        read_by_recipient=False,
    ).exclude(sender=request.user).update(read_by_recipient=True)

    # Push updated badge count to this user via Channels
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer
    channel_layer = get_channel_layer()
    if channel_layer:
        user = request.user
        if user.is_staff:
            from .consumers import _get_unread_count_for_staff
            import asyncio
            count = asyncio.run(_get_unread_count_for_staff())
            async_to_sync(channel_layer.group_send)(
                'staff_notifications',
                {'type': 'unread_count_update', 'count': count}
            )
        else:
            from .consumers import _get_unread_count
            import asyncio
            count = asyncio.run(_get_unread_count(user.id))
            async_to_sync(channel_layer.group_send)(
                f'user_{user.id}',
                {'type': 'unread_count_update', 'count': count}
            )

    return Response({'status': 'ok'})
```

- [ ] **Step 2: Run all tests**

```bash
cd server
python manage.py test -v 2
```

Expected: All tests pass (the `asyncio.run` call only fires when Redis is up; in tests, if channel_layer is None it skips gracefully).

- [ ] **Step 3: Commit**

```bash
cd server
git add content/views.py
git commit -m "feat: push notification badge update on mark_thread_read"
```

---

## Task 6: Frontend — NotificationContext and useNotifications hook

**Files:**
- Create: `client/src/app/hooks/useNotifications.ts`
- Create: `client/src/app/context/NotificationContext.tsx`

**Background:** `useNotifications` opens a WebSocket to `/ws/notifications/?token=...` and updates unread count on every frame. It reconnects with exponential backoff (max 30s). `NotificationContext` wraps the app, calls `useNotifications` only when the user is authenticated, and exposes `{ unreadCount }` globally.

- [ ] **Step 1: Create useNotifications.ts**

Create `client/src/app/hooks/useNotifications.ts`:

```typescript
import { useState, useEffect, useRef } from 'react';

const WS_BASE = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';

export function useNotifications(token: string | null): { unreadCount: number } {
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(1000);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!token) {
      setUnreadCount(0);
      return;
    }

    let ws: WebSocket;

    function connect() {
      if (!mountedRef.current) return;
      ws = new WebSocket(`${WS_BASE}/ws/notifications/?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        retryDelayRef.current = 1000; // reset backoff on success
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'unread_count') {
            setUnreadCount(data.count);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        const delay = retryDelayRef.current;
        retryDelayRef.current = Math.min(delay * 2, 30000);
        retryRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [token]);

  return { unreadCount };
}
```

- [ ] **Step 2: Create NotificationContext.tsx**

Create `client/src/app/context/NotificationContext.tsx`:

```typescript
import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useNotifications } from '../hooks/useNotifications';

interface NotificationContextType {
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextType>({ unreadCount: 0 });

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { unreadCount } = useNotifications(token);

  return (
    <NotificationContext.Provider value={{ unreadCount }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  return useContext(NotificationContext);
}
```

- [ ] **Step 3: Add VITE_WS_URL to client .env if it doesn't exist**

Check if `client/.env` or `client/.env.local` exists. If not, create `client/.env.local`:

```
VITE_WS_URL=ws://localhost:8000
```

- [ ] **Step 4: Wrap App in NotificationProvider**

In `client/src/app/App.tsx`, add the import and wrap the `AuthProvider` children:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ProtectedRoute } from './components/ProtectedRoute';
// ... (all other existing imports remain)

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Cursor />
          <Routes>
            {/* ... all existing routes ... */}
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
```

The full updated App.tsx content (preserving all existing routes, adding NotificationProvider, and adding the two new message routes):

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ServiceAreaPage } from './pages/ServiceAreaPage';
import { ServiceAreaEditor } from './components/admin/ServiceAreaEditor';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminBookings } from './pages/admin/AdminBookings';
import { AdminEditing } from './pages/admin/AdminEditing';
import { AdminAvailability } from './pages/admin/AdminAvailability';
import { AdminMessages } from './pages/admin/AdminMessages';
import { MessagesPage } from './pages/MessagesPage';
import { BookPage }    from './pages/BookPage';
import { EditingPage } from './pages/EditingPage';
import { Cursor } from './components/Cursor';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Portfolio } from './components/Portfolio';
import { Services } from './components/Services';
import { About } from './components/About';
import { Footer } from './components/Footer';

function HomePage() {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Header />
      <main>
        <Hero />
        <Portfolio />
        <Services />
        <About />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Cursor />
          <Routes>
            {/* Public */}
            <Route path="/"            element={<HomePage />} />
            <Route path="/login"       element={<LoginPage />} />
            <Route path="/register"    element={<RegisterPage />} />
            <Route path="/service-area" element={<ServiceAreaPage />} />

            {/* Customer (login required) */}
            <Route path="/book"      element={<ProtectedRoute><BookPage /></ProtectedRoute>} />
            <Route path="/editing"   element={<ProtectedRoute><EditingPage /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><div style={{ padding: 40 }}>Dashboard coming soon</div></ProtectedRoute>} />
            <Route path="/messages"  element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />

            {/* Admin routes (Kay only) */}
            <Route path="/admin" element={
              <ProtectedRoute requireStaff>
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="/admin/bookings" element={
              <ProtectedRoute requireStaff>
                <AdminBookings />
              </ProtectedRoute>
            } />
            <Route path="/admin/availability" element={
              <ProtectedRoute requireStaff>
                <AdminAvailability />
              </ProtectedRoute>
            } />
            <Route path="/admin/editing" element={
              <ProtectedRoute requireStaff>
                <AdminEditing />
              </ProtectedRoute>
            } />
            <Route path="/admin/messages" element={
              <ProtectedRoute requireStaff>
                <AdminMessages />
              </ProtectedRoute>
            } />
            <Route path="/admin/service-area" element={
              <ProtectedRoute requireStaff>
                <div style={{ padding: '80px 48px' }}>
                  <ServiceAreaEditor />
                </div>
              </ProtectedRoute>
            } />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
```

- [ ] **Step 5: Verify the app builds**

```bash
cd client
npm run build
```

Expected: Build succeeds. (The imported `MessagesPage` and `AdminMessages` don't exist yet — TypeScript will error. If so, create empty placeholder files first:)

```bash
mkdir -p client/src/app/pages/admin
echo "export function MessagesPage() { return <div>Loading…</div>; }" > client/src/app/pages/MessagesPage.tsx
echo "export function AdminMessages() { return <div>Loading…</div>; }" > client/src/app/pages/admin/AdminMessages.tsx
```

Then retry `npm run build` — it should succeed.

- [ ] **Step 6: Commit**

```bash
cd client
git add src/app/hooks/useNotifications.ts src/app/context/NotificationContext.tsx src/app/App.tsx src/app/pages/MessagesPage.tsx src/app/pages/admin/AdminMessages.tsx
git commit -m "feat: add NotificationContext, useNotifications hook, and App wiring"
```

---

## Task 7: Frontend — useChat hook

**Files:**
- Create: `client/src/app/hooks/useChat.ts`

- [ ] **Step 1: Create useChat.ts**

Create `client/src/app/hooks/useChat.ts`:

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
const WS_BASE = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';

export interface ChatMessage {
  id: number | null;
  is_system: boolean;
  sender_email: string | null;
  body: string;
  timestamp: string | null;
  is_own: boolean;
}

export function useChat(
  threadType: 'booking' | 'editing',
  threadId: number,
  token: string | null
): {
  messages: ChatMessage[];
  sendMessage: (body: string) => void;
  connected: boolean;
  loading: boolean;
} {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial message history and mark as read
  useEffect(() => {
    if (!token || !threadId) return;
    setLoading(true);

    const fetchAndMark = async () => {
      try {
        const [histResp] = await Promise.all([
          fetch(`${API_BASE}/messages/?thread_type=${threadType}&thread_id=${threadId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          // Mark as read in parallel
          fetch(`${API_BASE}/messages/read/`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ thread_type: threadType, thread_id: threadId }),
          }),
        ]);
        if (histResp.ok) {
          const data: ChatMessage[] = await histResp.json();
          setMessages(data);
        }
      } catch {
        // network error — messages stay empty
      } finally {
        setLoading(false);
      }
    };

    fetchAndMark();
  }, [threadType, threadId, token]);

  // Open WebSocket
  useEffect(() => {
    if (!token || !threadId) return;

    const ws = new WebSocket(
      `${WS_BASE}/ws/chat/${threadType}/${threadId}/?token=${token}`
    );
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => ws.close();

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data);
        if (frame.type === 'message') {
          setMessages(prev => [...prev, { ...frame.message, is_system: false }]);
        }
      } catch {
        // ignore
      }
    };

    return () => {
      ws.close();
    };
  }, [threadType, threadId, token]);

  const sendMessage = useCallback((body: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ body }));
    }
  }, []);

  return { messages, sendMessage, connected, loading };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd client
npx tsc --noEmit
```

Expected: No errors for `useChat.ts`.

- [ ] **Step 3: Commit**

```bash
cd client
git add src/app/hooks/useChat.ts
git commit -m "feat: add useChat hook for per-thread WebSocket messaging"
```

---

## Task 8: Frontend — ThreadList component

**Files:**
- Create: `client/src/app/components/ThreadList.tsx`

- [ ] **Step 1: Create ThreadList.tsx**

Create `client/src/app/components/ThreadList.tsx`:

```typescript
const FONT = "'Helvetica Neue', Arial, sans-serif";

export interface ThreadSummary {
  thread_type: 'booking' | 'editing';
  thread_id: number;
  subject: string;
  last_message_body: string;
  last_message_at: string | null;
  unread_count: number;
  customer_email?: string; // admin only
}

interface ThreadListProps {
  grouped: boolean;
  threads: ThreadSummary[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

function formatTime(isoString: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDay.getTime() === today.getTime()) {
    return `Today ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return `${date.getDate()} ${date.toLocaleString('en-GB', { month: 'short' })}`;
}

function ThreadRow({
  thread,
  isActive,
  onSelect,
}: {
  thread: ThreadSummary;
  isActive: boolean;
  onSelect: () => void;
}) {
  const key = `${thread.thread_type}_${thread.thread_id}`;
  const label = `${thread.thread_type === 'editing' ? 'Editing' : 'Booking'} · #${thread.thread_id}`;

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '12px 16px',
        background: isActive ? '#fff' : 'transparent',
        borderLeft: isActive ? '2px solid #111' : '2px solid transparent',
        borderBottom: '1px solid #f0f0f0',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}
      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = '#f7f7f7'; }}
      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {thread.customer_email && (
          <div style={{
            fontSize: 10, color: '#aaa', textTransform: 'uppercase',
            letterSpacing: '0.07em', marginBottom: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {thread.thread_type === 'editing' ? 'Editing' : 'Booking'} #{thread.thread_id} · {thread.customer_email}
          </div>
        )}
        {!thread.customer_email && (
          <div style={{
            fontSize: 10, color: '#aaa', letterSpacing: '0.04em', marginBottom: 2,
          }}>
            {label}
          </div>
        )}
        <div style={{
          fontWeight: 500, color: '#111', fontSize: 12, marginBottom: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {thread.subject || '(no subject)'}
        </div>
        <div style={{
          fontSize: 11, color: '#888',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {thread.last_message_body}
        </div>
        <div style={{ fontSize: 10, color: '#bbb', marginTop: 3 }}>
          {formatTime(thread.last_message_at)}
        </div>
      </div>
      {thread.unread_count > 0 && (
        <div style={{
          width: 17, height: 17,
          background: '#111', color: '#fff',
          borderRadius: '50%',
          fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginLeft: 8, marginTop: 2,
        }}>
          {thread.unread_count}
        </div>
      )}
    </div>
  );
}

export function ThreadList({ grouped, threads, selectedKey, onSelect }: ThreadListProps) {
  if (!grouped) {
    // Admin flat list
    return (
      <div style={{ overflow: 'hidden auto', height: '100%', fontFamily: FONT }}>
        <div style={{
          padding: '10px 16px',
          fontSize: 10, fontWeight: 600,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: '#aaa', borderBottom: '1px solid #f0f0f0',
        }}>
          All Conversations
        </div>
        {threads.length === 0 && (
          <div style={{ padding: '20px 16px', fontSize: 12, color: '#aaa' }}>
            No conversations yet.
          </div>
        )}
        {threads.map(t => {
          const key = `${t.thread_type}_${t.thread_id}`;
          return (
            <ThreadRow
              key={key}
              thread={t}
              isActive={selectedKey === key}
              onSelect={() => onSelect(key)}
            />
          );
        })}
      </div>
    );
  }

  // Customer grouped view
  const editing = threads.filter(t => t.thread_type === 'editing');
  const booking = threads.filter(t => t.thread_type === 'booking');

  return (
    <div style={{ overflow: 'hidden auto', height: '100%', fontFamily: FONT }}>
      <div style={{
        padding: '10px 16px',
        fontSize: 10, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: '#111', borderBottom: '1px solid #e5e7eb',
      }}>
        Editing Requests
      </div>
      {editing.length === 0 && (
        <div style={{ padding: '12px 16px', fontSize: 11, color: '#bbb' }}>No editing threads yet.</div>
      )}
      {editing.map(t => {
        const key = `editing_${t.thread_id}`;
        return (
          <ThreadRow key={key} thread={t} isActive={selectedKey === key} onSelect={() => onSelect(key)} />
        );
      })}

      <div style={{
        padding: '10px 16px',
        fontSize: 10, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: '#111', borderBottom: '1px solid #e5e7eb',
        borderTop: '1px solid #e5e7eb', marginTop: 4,
      }}>
        Bookings
      </div>
      {booking.length === 0 && (
        <div style={{ padding: '12px 16px', fontSize: 11, color: '#bbb' }}>No booking threads yet.</div>
      )}
      {booking.map(t => {
        const key = `booking_${t.thread_id}`;
        return (
          <ThreadRow key={key} thread={t} isActive={selectedKey === key} onSelect={() => onSelect(key)} />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd client
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd client
git add src/app/components/ThreadList.tsx
git commit -m "feat: add ThreadList sidebar component"
```

---

## Task 9: Frontend — ChatPanel component

**Files:**
- Create: `client/src/app/components/ChatPanel.tsx`

- [ ] **Step 1: Create ChatPanel.tsx**

Create `client/src/app/components/ChatPanel.tsx`:

```typescript
import { useRef, useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat, type ChatMessage } from '../hooks/useChat';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
const FONT = "'Helvetica Neue', Arial, sans-serif";

interface ThreadMeta {
  thread_type: 'booking' | 'editing';
  thread_id: number;
  subject: string;
  customer_email?: string;
  status?: string;
  quoted_price?: string | null;
}

interface ChatPanelProps {
  threadType: 'booking' | 'editing';
  threadId: number;
  isAdmin: boolean;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

export function ChatPanel({ threadType, threadId, isAdmin }: ChatPanelProps) {
  const { token, user } = useAuth();
  const { messages, sendMessage, connected, loading } = useChat(threadType, threadId, token);
  const [meta, setMeta] = useState<ThreadMeta | null>(null);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch thread metadata (subject, status, quote)
  useEffect(() => {
    if (!token || !threadId) return;
    const endpoint = threadType === 'editing'
      ? `${API_BASE}/admin/editing-requests/`
      : `${API_BASE}/admin/bookings/`;

    if (isAdmin) {
      fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then((items: Array<{
          id: number; customer_email: string; style_notes?: string;
          session_type?: string; location?: string; status: string; quoted_price?: string
        }>) => {
          const item = items.find(i => i.id === threadId);
          if (item) {
            const subject = threadType === 'editing'
              ? (item.style_notes ?? '').slice(0, 60)
              : `${item.session_type ?? ''} · ${item.location ?? ''}`;
            setMeta({
              thread_type: threadType,
              thread_id: threadId,
              subject,
              customer_email: item.customer_email,
              status: item.status,
              quoted_price: item.quoted_price,
            });
          }
        })
        .catch(() => {});
    }
  }, [threadType, threadId, token, isAdmin]);

  const handleSend = useCallback(() => {
    const body = inputValue.trim();
    if (!body) return;
    sendMessage(body);
    setInputValue('');
    textareaRef.current?.focus();
  }, [inputValue, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Find the first unread message index (for "New" divider)
  const firstUnreadIndex = messages.findIndex(
    m => !m.is_system && !m.is_own && m.id !== null
  );

  const systemMessage = messages.find(m => m.is_system);
  const chatMessages = messages.filter(m => !m.is_system);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: FONT }}>

      {/* Thread header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
          {threadType === 'editing' ? 'Editing' : 'Booking'} Request #{threadId}
          {isAdmin && meta?.customer_email && ` · ${meta.customer_email}`}
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>
          {meta?.subject ?? '…'}
        </div>
        {(meta?.status || meta?.quoted_price) && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
            {meta.status && `Status: ${meta.status}`}
            {meta.status && meta.quoted_price && ' · '}
            {meta.quoted_price && `Quote: £${meta.quoted_price}`}
          </div>
        )}
      </div>

      {/* Auto-opener system message */}
      {systemMessage && (
        <div style={{
          margin: '14px 24px 6px',
          padding: '11px 14px',
          background: '#f3f4f6',
          border: '1px solid #e5e7eb',
          borderRadius: 3,
          fontSize: 12, color: '#555', lineHeight: 1.5,
          flexShrink: 0,
        }}>
          {systemMessage.body}
        </div>
      )}

      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#bbb', fontSize: 12, marginTop: 24 }}>Loading…</div>
        )}
        {!loading && chatMessages.map((m, i) => {
          const showDivider = i === firstUnreadIndex && firstUnreadIndex > 0;
          return (
            <div key={m.id ?? `sys-${i}`}>
              {showDivider && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
                  <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                  <div style={{ fontSize: 10, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase' }}>New</div>
                  <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                </div>
              )}
              <div style={{ alignSelf: m.is_own ? 'flex-end' : 'flex-start', maxWidth: '60%', display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  background: m.is_own ? '#111' : '#f3f4f6',
                  color: m.is_own ? '#fff' : '#111',
                  padding: '10px 13px',
                  borderRadius: 3,
                  fontSize: 12,
                  lineHeight: 1.5,
                  wordBreak: 'break-word',
                }}>
                  {m.body}
                </div>
                <div style={{
                  fontSize: 10, color: '#bbb', marginTop: 3,
                  textAlign: m.is_own ? 'right' : 'left',
                }}>
                  {m.is_own
                    ? `You · ${formatTimestamp(m.timestamp)}`
                    : `${isAdmin ? (m.sender_email ?? 'Customer') : 'Kay'} · ${formatTimestamp(m.timestamp)}`
                  }
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: '14px 24px',
        borderTop: '1px solid #e5e7eb',
        display: 'flex', gap: 10, alignItems: 'flex-end',
        flexShrink: 0,
      }}>
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={2}
          style={{
            flex: 1,
            background: '#f9f9f9',
            border: '1px solid #e5e7eb',
            padding: '10px 12px',
            fontSize: 12,
            fontFamily: FONT,
            color: '#111',
            borderRadius: 2,
            resize: 'none',
            outline: 'none',
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!connected || !inputValue.trim()}
          style={{
            background: connected ? '#111' : '#ccc',
            color: '#fff',
            padding: '10px 18px',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            border: 'none',
            borderRadius: 2,
            cursor: connected ? 'pointer' : 'not-allowed',
            flexShrink: 0,
            fontFamily: FONT,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd client
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd client
git add src/app/components/ChatPanel.tsx
git commit -m "feat: add ChatPanel component"
```

---

## Task 10: Frontend — MessagesPage (customer)

**Files:**
- Modify: `client/src/app/pages/MessagesPage.tsx` (replace placeholder)

- [ ] **Step 1: Replace MessagesPage.tsx**

Replace the placeholder `client/src/app/pages/MessagesPage.tsx` with:

```typescript
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ThreadList, type ThreadSummary } from '../components/ThreadList';
import { ChatPanel } from '../components/ChatPanel';
import { Header } from '../components/Header';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
const FONT = "'Helvetica Neue', Arial, sans-serif";

export function MessagesPage() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    searchParams.get('thread') ?? null
  );
  const [loading, setLoading] = useState(true);

  // Fetch thread list
  const fetchThreads = async () => {
    if (!token) return;
    try {
      const resp = await fetch(`${API_BASE}/messages/threads/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        // Customer response is grouped: { editing: [...], booking: [...] }
        const editing: ThreadSummary[] = (data.editing ?? []).map((t: ThreadSummary) => ({
          ...t, thread_type: 'editing' as const,
        }));
        const booking: ThreadSummary[] = (data.booking ?? []).map((t: ThreadSummary) => ({
          ...t, thread_type: 'booking' as const,
        }));
        setThreads([...editing, ...booking]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchThreads(); }, [token]);

  const selectedThread = selectedKey
    ? (() => {
        const [type, idStr] = selectedKey.split('_');
        return { threadType: type as 'booking' | 'editing', threadId: parseInt(idStr, 10) };
      })()
    : null;

  return (
    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: FONT }}>
      <Header />
      <div style={{
        display: 'flex',
        height: 'calc(100vh - 64px)',
        marginTop: 64,
        overflow: 'hidden',
      }}>
        {/* Sidebar */}
        <div style={{
          width: 260,
          flexShrink: 0,
          borderRight: '1px solid #e5e7eb',
          background: '#fafafa',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            padding: '16px 16px 12px',
            fontSize: 11, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#111', borderBottom: '1px solid #e5e7eb',
            flexShrink: 0,
          }}>
            Messages
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 20, fontSize: 12, color: '#bbb' }}>Loading…</div>
            ) : (
              <ThreadList
                grouped
                threads={threads}
                selectedKey={selectedKey}
                onSelect={key => {
                  setSelectedKey(key);
                  fetchThreads(); // refresh unread counts
                }}
              />
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedThread ? (
            <ChatPanel
              threadType={selectedThread.threadType}
              threadId={selectedThread.threadId}
              isAdmin={false}
            />
          ) : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#bbb', fontSize: 13,
            }}>
              Select a conversation to start messaging
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd client
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd client
git add src/app/pages/MessagesPage.tsx
git commit -m "feat: add customer MessagesPage"
```

---

## Task 11: Frontend — AdminMessages page

**Files:**
- Modify: `client/src/app/pages/admin/AdminMessages.tsx` (replace placeholder)

- [ ] **Step 1: Replace AdminMessages.tsx**

Replace the placeholder `client/src/app/pages/admin/AdminMessages.tsx` with:

```typescript
import { useState, useEffect } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { ThreadList, type ThreadSummary } from '../../components/ThreadList';
import { ChatPanel } from '../../components/ChatPanel';
import { useAuth } from '../../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
const FONT = "'Helvetica Neue', Arial, sans-serif";

export function AdminMessages() {
  const { token } = useAuth();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchThreads = async () => {
    if (!token) return;
    try {
      const resp = await fetch(`${API_BASE}/messages/threads/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data: ThreadSummary[] = await resp.json();
        setThreads(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchThreads(); }, [token]);

  const selectedThread = selectedKey
    ? (() => {
        const [type, idStr] = selectedKey.split('_');
        return { threadType: type as 'booking' | 'editing', threadId: parseInt(idStr, 10) };
      })()
    : null;

  return (
    <AdminLayout activeTab="messages">
      <div style={{
        display: 'flex',
        height: 'calc(100vh - 64px - 80px)',
        overflow: 'hidden',
        margin: '-40px -32px',
        fontFamily: FONT,
      }}>
        {/* Sidebar */}
        <div style={{
          width: 260,
          flexShrink: 0,
          borderRight: '1px solid #e5e7eb',
          background: '#fafafa',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            padding: '16px 16px 12px',
            fontSize: 11, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#111', borderBottom: '1px solid #e5e7eb',
            flexShrink: 0,
          }}>
            Inbox
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 20, fontSize: 12, color: '#bbb' }}>Loading…</div>
            ) : (
              <ThreadList
                grouped={false}
                threads={threads}
                selectedKey={selectedKey}
                onSelect={key => {
                  setSelectedKey(key);
                  fetchThreads();
                }}
              />
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedThread ? (
            <ChatPanel
              threadType={selectedThread.threadType}
              threadId={selectedThread.threadId}
              isAdmin
            />
          ) : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#bbb', fontSize: 13,
            }}>
              Select a conversation
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd client
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd client
git add src/app/pages/admin/AdminMessages.tsx
git commit -m "feat: add AdminMessages page"
```

---

## Task 12: Frontend — Header badge + AdminLayout tab

**Files:**
- Modify: `client/src/app/components/Header.tsx`
- Modify: `client/src/app/components/admin/AdminLayout.tsx`

- [ ] **Step 1: Add Messages link + badge to Header.tsx**

In `client/src/app/components/Header.tsx`, add the import at the top:

```typescript
import { useNotificationContext } from '../context/NotificationContext';
```

Inside the `Header` function, after the `useAuth` line, add:

```typescript
const { unreadCount } = useNotificationContext();
```

In the desktop nav (right side, before the Admin link section), add a Messages link. Find the block containing the `Book` and `Editing` links:

```typescript
{/* Book + Editing — desktop only */}
<Link to="/book" className="hidden md:inline" style={{...}}>
  Book
</Link>
<Link to="/editing" className="hidden md:inline" style={{...}}>
  Editing
</Link>
```

After the `Editing` link, add:

```typescript
{user && (
  <Link
    to="/messages"
    className="hidden md:inline"
    style={{
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      fontSize: 12, fontWeight: 500, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: '#111', textDecoration: 'none',
      display: 'inline-flex', alignItems: 'center', gap: 5,
    }}
  >
    Messages
    {unreadCount > 0 && (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16,
        background: '#111', color: '#fff',
        borderRadius: '50%',
        fontSize: 9, fontWeight: 700,
      }}>
        {unreadCount}
      </span>
    )}
  </Link>
)}
```

Also add the Messages link to the mobile overlay nav (inside the CTA buttons section, after the `Submit for Editing` link):

```typescript
{user && (
  <Link
    to="/messages"
    onClick={closeMenu}
    style={{
      padding: '13px 40px',
      border: '1px solid #111', color: '#111',
      fontSize: 11, fontWeight: 600, letterSpacing: '0.15em',
      textTransform: 'uppercase', textDecoration: 'none',
      display: 'flex', alignItems: 'center', gap: 8,
    }}
  >
    Messages
    {unreadCount > 0 && (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16,
        background: '#111', color: '#fff',
        borderRadius: '50%',
        fontSize: 9, fontWeight: 700,
      }}>
        {unreadCount}
      </span>
    )}
  </Link>
)}
```

- [ ] **Step 2: Add Messages tab to AdminLayout.tsx**

In `client/src/app/components/admin/AdminLayout.tsx`, update the `AdminTab` type and `TABS` array:

```typescript
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotificationContext } from '../../context/NotificationContext';

type AdminTab = 'dashboard' | 'bookings' | 'availability' | 'messages' | 'editing' | 'service-area';

const TABS: { label: string; tab: AdminTab; path: string }[] = [
  { label: 'Dashboard',    tab: 'dashboard',    path: '/admin' },
  { label: 'Bookings',     tab: 'bookings',     path: '/admin/bookings' },
  { label: 'Availability', tab: 'availability', path: '/admin/availability' },
  { label: 'Messages',     tab: 'messages',     path: '/admin/messages' },
  { label: 'Editing',      tab: 'editing',      path: '/admin/editing' },
  { label: 'Service Area', tab: 'service-area', path: '/admin/service-area' },
];
```

Inside `AdminLayout`, add:

```typescript
const { unreadCount } = useNotificationContext();
```

Then update the tab rendering to show a badge on Messages:

```typescript
{TABS.map(({ label, tab, path }) => {
  const isActive = activeTab === tab;
  const showBadge = tab === 'messages' && unreadCount > 0;
  return (
    <Link
      key={tab}
      to={path}
      style={{
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        fontSize: 12, fontWeight: isActive ? 500 : 400,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: isActive ? '#111' : '#888',
        textDecoration: 'none',
        paddingBottom: 3,
        borderBottom: isActive ? '1px solid #111' : '1px solid transparent',
        transition: 'color 0.2s, border-color 0.2s',
        display: 'inline-flex', alignItems: 'center', gap: 5,
      }}
      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = '#111'; }}
      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = '#888'; }}
    >
      {label}
      {showBadge && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 15, height: 15,
          background: '#111', color: '#fff',
          borderRadius: '50%',
          fontSize: 8, fontWeight: 700,
        }}>
          {unreadCount}
        </span>
      )}
    </Link>
  );
})}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd client
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd client
git add src/app/components/Header.tsx src/app/components/admin/AdminLayout.tsx
git commit -m "feat: add Messages link + unread badge to Header and AdminLayout"
```

---

## Task 13: Manual smoke test

This task has no automated tests — verify the system works end-to-end manually.

**Prerequisites:**
- Redis running: `redis-server`
- Django running: `cd server && daphne backend.asgi:application`
- React dev server running: `cd client && npm run dev`

- [ ] **Step 1: Create a test customer and an editing request**

In the browser:
1. Register a new customer account at `http://localhost:5173/register`
2. Log in, go to `/editing`, submit an editing request

- [ ] **Step 2: Verify customer Messages page**

1. Navigate to `/messages`
2. You should see the editing request in the sidebar under "Editing Requests"
3. Click it — the chat panel should appear with the auto-opener system message
4. Type a message and press Enter — it should appear as a right-aligned black bubble

- [ ] **Step 3: Verify admin Messages page**

1. Open a second browser window (or incognito) and log in as Kay (staff)
2. Navigate to `/admin/messages`
3. The conversation should appear in the flat inbox sidebar
4. Click it — the auto-opener and the customer's message should be visible
5. Type a reply — it should appear as a left-aligned grey bubble in Kay's window and a left-aligned grey bubble in the customer's window (real-time)

- [ ] **Step 4: Verify unread badge**

1. In the customer's browser, navigate away from `/messages` to the home page
2. In Kay's browser, send a new message to the customer
3. The customer's header should show a badge with count `1` on "Messages" without a page refresh

- [ ] **Step 5: Verify read clears the badge**

1. In the customer's browser, navigate back to `/messages` and open the thread
2. The badge should disappear (mark-read is called on open)
3. In Kay's admin view, the unread indicator on that thread should clear

- [ ] **Step 6: Commit**

No code changes in this step — just a completion commit:

```bash
git add .
git commit -m "chore: messenger feature complete — manual smoke tests passed"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| Message model `read_by_recipient` field | Task 2 |
| GET /api/messages/threads/ — customer grouped | Task 3 |
| GET /api/messages/threads/ — admin flat | Task 3 |
| GET /api/messages/?thread_type=X&thread_id=Y | Task 3 |
| POST /api/messages/send/ | Task 3 |
| POST /api/messages/read/ | Task 3, Task 5 |
| Thread subject generation (editing/booking) | Task 3 (`_thread_subject`) |
| Auto-opener system message | Task 3 (`_system_message`) |
| ChatConsumer + JWT auth | Task 4 |
| NotificationConsumer + JWT auth | Task 4 |
| Channel group `chat_{type}_{id}` | Task 4 |
| Channel group `user_{user_id}` | Task 4 |
| Broadcast to group on receive | Task 4 |
| Push unread count to recipient on new message | Task 4, Task 5 |
| NotificationContext | Task 6 |
| useNotifications with exponential backoff | Task 6 |
| useChat hook | Task 7 |
| ThreadList component | Task 8 |
| ChatPanel component | Task 9 |
| MessagesPage /messages (customer) | Task 10 |
| AdminMessages /admin/messages | Task 11 |
| Header Messages link + badge (logged-in only) | Task 12 |
| AdminLayout Messages tab + badge | Task 12 |
| App.tsx routing | Task 6 |
| "New" divider above first unread message | Task 9 (ChatPanel) |
| ?thread= query param to auto-select thread | Task 10 (MessagesPage reads searchParams) |

All spec requirements are covered. No placeholders found.

### Type consistency check

- `ThreadSummary` defined in `ThreadList.tsx`, imported in `MessagesPage.tsx` and `AdminMessages.tsx` ✓
- `ChatMessage` defined in `useChat.ts`, imported in `ChatPanel.tsx` ✓
- `AdminTab` updated to include `'messages'` ✓
- `NotificationProvider` exported from `NotificationContext.tsx`, imported in `App.tsx` ✓
- `useNotificationContext` exported and used in `Header.tsx` and `AdminLayout.tsx` ✓
