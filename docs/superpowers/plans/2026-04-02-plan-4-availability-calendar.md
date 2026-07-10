# Availability Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `AvailabilitySlot` with block + status fields and give Kay an admin calendar UI to manage her availability per day per time block.

**Architecture:** Three fixed time blocks per day (morning/afternoon/evening with hardcoded times). Backend stores one row per `(date, block)` pair. Four new API endpoints: three admin (list, upsert, delete) and one public customer-facing (read-only). Frontend adds an `AdminAvailability` page with a month grid + day detail panel, and a new Availability tab to `AdminLayout`.

**Tech Stack:** Django REST Framework (`IsAdminUser`), React + TypeScript, inline styles (Helvetica Neue, monochrome palette matching existing app), `api.ts` fetch helpers.

---

## File Map

### Backend — modified
| File | Change |
|---|---|
| `server/content/models.py` | Add `block`, `status` to `AvailabilitySlot`; update unique constraint; override `save()` to auto-fill times |
| `server/content/migrations/00XX_availabilityslot_block_status.py` | Migration: add fields, update constraint |
| `server/content/views.py` | Add `admin_availability_list`, `admin_availability_upsert`, `admin_availability_delete`, `customer_availability` |
| `server/content/urls.py` | Register 4 new routes |
| `server/content/tests.py` | Add `AvailabilitySlotModelTests`, `AdminAvailabilityAPITests`, `CustomerAvailabilityAPITests` |

### Frontend — new/modified
| File | Change |
|---|---|
| `client/src/app/components/admin/AdminLayout.tsx` | Add Availability tab (5th tab, between Bookings and Editing) |
| `client/src/app/pages/admin/AdminAvailability.tsx` | New: month grid + day detail panel |
| `client/src/app/App.tsx` | Add `/admin/availability` route |

---

## Task 1: Extend AvailabilitySlot model

**Files:**
- Modify: `server/content/models.py`
- Modify: `server/content/tests.py`

- [ ] **Step 1: Write the failing test**

Add to `server/content/tests.py`:

```python
class AvailabilitySlotModelTests(TestCase):
    def test_block_auto_fills_morning_times(self):
        slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1),
            block='morning',
            status='available',
        )
        self.assertEqual(slot.start_time, datetime.time(8, 0))
        self.assertEqual(slot.end_time, datetime.time(11, 0))

    def test_block_auto_fills_afternoon_times(self):
        slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1),
            block='afternoon',
            status='available',
        )
        self.assertEqual(slot.start_time, datetime.time(12, 0))
        self.assertEqual(slot.end_time, datetime.time(15, 0))

    def test_block_auto_fills_evening_times(self):
        slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1),
            block='evening',
            status='potential',
        )
        self.assertEqual(slot.start_time, datetime.time(16, 0))
        self.assertEqual(slot.end_time, datetime.time(20, 0))

    def test_unique_date_block_constraint(self):
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1),
            block='morning',
            status='available',
        )
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            AvailabilitySlot.objects.create(
                date=datetime.date(2026, 5, 1),
                block='morning',
                status='unavailable',
            )
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server
python manage.py test content.tests.AvailabilitySlotModelTests -v 2
```
Expected: FAIL — `block` field not found.

- [ ] **Step 3: Update the model**

Replace the `AvailabilitySlot` class in `server/content/models.py`:

```python
class AvailabilitySlot(models.Model):
    BLOCK_CHOICES = [
        ('morning',   'Morning'),
        ('afternoon', 'Afternoon'),
        ('evening',   'Evening'),
    ]
    STATUS_CHOICES = [
        ('available',   'Available'),
        ('potential',   'Potential'),
        ('unavailable', 'Unavailable'),
    ]
    BLOCK_TIMES = {
        'morning':   (datetime.time(8, 0),  datetime.time(11, 0)),
        'afternoon': (datetime.time(12, 0), datetime.time(15, 0)),
        'evening':   (datetime.time(16, 0), datetime.time(20, 0)),
    }

    date       = models.DateField()
    block      = models.CharField(max_length=10, choices=BLOCK_CHOICES)
    start_time = models.TimeField()
    end_time   = models.TimeField()
    status     = models.CharField(max_length=15, choices=STATUS_CHOICES)
    is_booked  = models.BooleanField(default=False)

    class Meta:
        ordering = ['date', 'block']
        unique_together = ['date', 'block']

    def save(self, *args, **kwargs):
        self.start_time, self.end_time = self.BLOCK_TIMES[self.block]
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.date} {self.block} ({self.status})"
```

Also add `import datetime` at the top of `models.py` (after the existing imports).

- [ ] **Step 4: Create and run the migration**

```bash
cd server
python manage.py makemigrations content --name availabilityslot_block_status
python manage.py migrate
```
Expected: migration runs without errors.

- [ ] **Step 5: Update the existing smoke test**

The existing `test_availability_slot_creation` in `ModelSmokeTests` uses the old fields. Replace it in `server/content/tests.py`:

```python
def test_availability_slot_creation(self):
    slot = AvailabilitySlot.objects.create(
        date=datetime.date(2026, 6, 1),
        block='morning',
        status='available',
    )
    self.assertFalse(slot.is_booked)
    self.assertEqual(slot.start_time, datetime.time(8, 0))
    self.assertEqual(slot.end_time, datetime.time(11, 0))
```

Also update `test_booking_request_creation` in `ModelSmokeTests` — replace the slot creation:

```python
slot = AvailabilitySlot.objects.create(
    date=datetime.date(2026, 6, 1),
    block='morning',
    status='available',
)
```

- [ ] **Step 6: Run all tests**

```bash
cd server
python manage.py test content -v 2
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
cd server
git add content/models.py content/migrations/ content/tests.py
git commit -m "feat: extend AvailabilitySlot with block and status fields"
```

---

## Task 2: Admin availability endpoints

**Files:**
- Modify: `server/content/views.py`
- Modify: `server/content/urls.py`
- Modify: `server/content/tests.py`

- [ ] **Step 1: Write the failing tests**

Add to `server/content/tests.py`:

```python
class AdminAvailabilityAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.staff = User.objects.create_user(
            username='kay@test.com', email='kay@test.com',
            password='pass', is_staff=True
        )
        self.customer = User.objects.create_user(
            username='cust@test.com', email='cust@test.com',
            password='pass'
        )

    def test_list_requires_staff(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.get('/api/admin/availability/?month=2026-05')
        self.assertEqual(res.status_code, 403)

    def test_list_requires_month_param(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.get('/api/admin/availability/')
        self.assertEqual(res.status_code, 400)

    def test_list_returns_slots_for_month(self):
        self.client.force_authenticate(user=self.staff)
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='morning', status='available'
        )
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 6, 1), block='morning', status='available'
        )
        res = self.client.get('/api/admin/availability/?month=2026-05')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['block'], 'morning')

    def test_upsert_creates_slot(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post('/api/admin/availability/', {
            'date': '2026-05-01', 'block': 'morning', 'status': 'available'
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(AvailabilitySlot.objects.count(), 1)
        slot = AvailabilitySlot.objects.first()
        self.assertEqual(slot.start_time, datetime.time(8, 0))
        self.assertEqual(slot.end_time, datetime.time(11, 0))

    def test_upsert_updates_existing_slot(self):
        self.client.force_authenticate(user=self.staff)
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='morning', status='available'
        )
        res = self.client.post('/api/admin/availability/', {
            'date': '2026-05-01', 'block': 'morning', 'status': 'unavailable'
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(AvailabilitySlot.objects.count(), 1)
        self.assertEqual(AvailabilitySlot.objects.first().status, 'unavailable')

    def test_upsert_rejects_invalid_block(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post('/api/admin/availability/', {
            'date': '2026-05-01', 'block': 'lunchtime', 'status': 'available'
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_delete_removes_slot(self):
        self.client.force_authenticate(user=self.staff)
        slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='morning', status='available'
        )
        res = self.client.delete(f'/api/admin/availability/{slot.id}/')
        self.assertEqual(res.status_code, 204)
        self.assertEqual(AvailabilitySlot.objects.count(), 0)

    def test_delete_rejects_booked_slot(self):
        self.client.force_authenticate(user=self.staff)
        slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='morning',
            status='available', is_booked=True
        )
        res = self.client.delete(f'/api/admin/availability/{slot.id}/')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(AvailabilitySlot.objects.count(), 1)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server
python manage.py test content.tests.AdminAvailabilityAPITests -v 2
```
Expected: FAIL — views not yet defined.

- [ ] **Step 3: Add the four views to `server/content/views.py`**

Add after the `admin_editing_message` view:

```python
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
        import datetime as dt
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
```

Also update the import at the top of `views.py` to include `AvailabilitySlot`:

```python
from .models import AvailabilitySlot, BookingRequest, EditingRequest, Message, PortfolioItem, ServiceArea
```

- [ ] **Step 4: Register routes in `server/content/urls.py`**

Add to `urlpatterns`:

```python
path('admin/availability/',          views.admin_availability_list),
path('admin/availability/upsert/',   views.admin_availability_upsert),
path('admin/availability/<int:pk>/', views.admin_availability_delete),
```

- [ ] **Step 5: Run tests**

```bash
cd server
python manage.py test content.tests.AdminAvailabilityAPITests -v 2
```
Expected: all 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/content/views.py server/content/urls.py server/content/tests.py
git commit -m "feat: admin availability list/upsert/delete endpoints"
```

---

## Task 3: Customer availability endpoint

**Files:**
- Modify: `server/content/views.py`
- Modify: `server/content/urls.py`
- Modify: `server/content/tests.py`

- [ ] **Step 1: Write the failing tests**

Add to `server/content/tests.py`:

```python
class CustomerAvailabilityAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()

    def test_requires_month_param(self):
        res = self.client.get('/api/availability/')
        self.assertEqual(res.status_code, 400)

    def test_returns_available_and_potential_slots_only(self):
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='morning', status='available'
        )
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='afternoon', status='potential'
        )
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='evening', status='unavailable'
        )
        res = self.client.get('/api/availability/?month=2026-05')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)
        statuses = {s['status'] for s in res.data}
        self.assertNotIn('unavailable', statuses)

    def test_returns_booked_slots_with_is_booked_true(self):
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='morning',
            status='available', is_booked=True
        )
        res = self.client.get('/api/availability/?month=2026-05')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertTrue(res.data[0]['is_booked'])

    def test_filters_by_month(self):
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='morning', status='available'
        )
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 6, 1), block='morning', status='available'
        )
        res = self.client.get('/api/availability/?month=2026-05')
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['date'], '2026-05-01')
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server
python manage.py test content.tests.CustomerAvailabilityAPITests -v 2
```
Expected: FAIL — view not found.

- [ ] **Step 3: Add view to `server/content/views.py`**

Add after `admin_availability_delete`:

```python
@api_view(['GET'])
@permission_classes([AllowAny])
def customer_availability(request):
    month = request.query_params.get('month')
    if not month:
        return Response({'error': 'month param required (YYYY-MM)'}, status=400)
    try:
        year, mon = month.split('-')
        year, mon = int(year), int(mon)
    except (ValueError, AttributeError):
        return Response({'error': 'month must be YYYY-MM'}, status=400)

    slots = AvailabilitySlot.objects.filter(
        date__year=year, date__month=mon,
    ).exclude(status='unavailable')

    return Response([{
        'id': s.id,
        'date': s.date.isoformat(),
        'block': s.block,
        'start_time': s.start_time.strftime('%H:%M'),
        'end_time': s.end_time.strftime('%H:%M'),
        'status': s.status,
        'is_booked': s.is_booked,
    } for s in slots])
```

- [ ] **Step 4: Register route in `server/content/urls.py`**

Add to `urlpatterns`:

```python
path('availability/', views.customer_availability),
```

- [ ] **Step 5: Run tests**

```bash
cd server
python manage.py test content.tests.CustomerAvailabilityAPITests -v 2
```
Expected: all 4 tests pass.

- [ ] **Step 6: Run the full test suite**

```bash
cd server
python manage.py test content -v 2
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/content/views.py server/content/urls.py server/content/tests.py
git commit -m "feat: customer availability read endpoint"
```

---

## Task 4: AdminAvailability page — month grid

**Files:**
- Create: `client/src/app/pages/admin/AdminAvailability.tsx`

- [ ] **Step 1: Create the file with the month grid**

Create `client/src/app/pages/admin/AdminAvailability.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { api } from '../../lib/api';

interface Slot {
  id: number;
  date: string;
  block: 'morning' | 'afternoon' | 'evening';
  start_time: string;
  end_time: string;
  status: 'available' | 'potential' | 'unavailable';
  is_booked: boolean;
}

const BLOCKS: Array<'morning' | 'afternoon' | 'evening'> = ['morning', 'afternoon', 'evening'];

const BLOCK_LABELS = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
const BLOCK_TIMES  = { morning: '08:00–11:00', afternoon: '12:00–15:00', evening: '16:00–20:00' };

const DOT_COLORS: Record<string, string> = {
  available:   '#22c55e',
  potential:   '#f59e0b',
  unavailable: '#ef4444',
  booked:      '#3b82f6',
  unset:       '#d1d5db',
};

const STATUS_CYCLE: Record<string, string | null> = {
  unset:       'available',
  available:   'potential',
  potential:   'unavailable',
  unavailable: null,  // null means delete (back to unset)
};

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  available:   { bg: '#d1fae5', color: '#065f46', label: 'Available' },
  potential:   { bg: '#fef3c7', color: '#92400e', label: 'Potential' },
  unavailable: { bg: '#fee2e2', color: '#991b1b', label: 'Unavailable' },
  booked:      { bg: '#dbeafe', color: '#1e40af', label: 'Booked' },
  unset:       { bg: '#f3f4f6', color: '#9ca3af', label: 'Not set' },
};

function toYYYYMM(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function AdminAvailability() {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // pendingChanges: date+block → new status ('unset' means delete)
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const monthKey = toYYYYMM(year, month);

  useEffect(() => {
    setSelectedDate(null);
    setPendingChanges({});
    api.get<Slot[]>(`/admin/availability/?month=${monthKey}`)
      .then(setSlots)
      .catch(() => setError('Failed to load availability.'));
  }, [monthKey]);

  // Group slots by date
  const slotsByDate: Record<string, Slot[]> = {};
  for (const s of slots) {
    if (!slotsByDate[s.date]) slotsByDate[s.date] = [];
    slotsByDate[s.date].push(s);
  }

  // Get effective status for a (date, block) considering pending changes
  function getEffectiveStatus(date: string, block: string): string {
    const key = `${date}__${block}`;
    if (key in pendingChanges) return pendingChanges[key] ?? 'unset';
    const daySlots = slotsByDate[date] ?? [];
    const slot = daySlots.find(s => s.block === block);
    if (!slot) return 'unset';
    return slot.is_booked ? 'booked' : slot.status;
  }

  function cyclePendingBlock(date: string, block: string) {
    const current = getEffectiveStatus(date, block);
    if (current === 'booked') return;  // cannot change booked slots
    const next = STATUS_CYCLE[current] ?? 'unset';
    setPendingChanges(prev => ({ ...prev, [`${date}__${block}`]: next ?? 'unset' }));
  }

  async function saveDay(date: string) {
    setSaving(true);
    setError('');
    try {
      const daySlots = slotsByDate[date] ?? [];
      const slotById: Record<string, Slot> = {};
      for (const s of daySlots) slotById[s.block] = s;

      for (const block of BLOCKS) {
        const key = `${date}__${block}`;
        if (!(key in pendingChanges)) continue;
        const newStatus = pendingChanges[key];
        if (newStatus === 'unset') {
          // delete if exists
          const existing = slotById[block];
          if (existing) {
            await api.delete(`/admin/availability/${existing.id}/`);
          }
        } else {
          await api.post('/admin/availability/upsert/', { date, block, status: newStatus });
        }
      }
      // Refresh month data
      const updated = await api.get<Slot[]>(`/admin/availability/?month=${monthKey}`);
      setSlots(updated);
      setPendingChanges(prev => {
        const next = { ...prev };
        for (const block of BLOCKS) delete next[`${date}__${block}`];
        return next;
      });
    } catch {
      setError('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  // Calendar grid helpers
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const daysInMonth     = new Date(year, month, 0).getDate();
  const startDow        = (firstDayOfMonth.getDay() + 6) % 7; // Mon=0

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const hasPendingForDate = (date: string) =>
    BLOCKS.some(b => `${date}__${b}` in pendingChanges);

  return (
    <AdminLayout activeTab="availability">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 13, fontWeight: 500, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: '#111', margin: 0,
        }}>
          Availability
        </h1>
      </div>

      {error && <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Month grid */}
        <div style={{
          background: '#fff', border: '1px solid rgba(0,0,0,0.06)',
          padding: '24px 24px 20px', flex: '1 1 400px',
        }}>
          {/* Month nav */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button onClick={prevMonth} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#555', padding: '4px 8px' }}>‹</button>
            <span style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 500, letterSpacing: '0.06em', color: '#111' }}>
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button onClick={nextMonth} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#555', padding: '4px 8px' }}>›</button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
            {DAY_LABELS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#aaa', padding: '4px 0' }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {/* Empty cells before month start */}
            {Array.from({ length: startDow }).map((_, i) => <div key={`empty-${i}`} />)}

            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const dateStr = toDateStr(year, month, day);
              const isSelected = selectedDate === dateStr;
              const hasPending = hasPendingForDate(dateStr);

              return (
                <div
                  key={day}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  style={{
                    padding: '6px 4px 8px',
                    border: isSelected ? '2px solid #111' : '1px solid rgba(0,0,0,0.06)',
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: isSelected ? '#fafafa' : '#fff',
                    textAlign: 'center',
                    position: 'relative',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: isSelected ? 600 : 400, color: '#111', marginBottom: 4 }}>
                    {day}
                    {hasPending && <span style={{ color: '#f59e0b', fontSize: 10, marginLeft: 2 }}>•</span>}
                  </div>
                  {/* Three block dots */}
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                    {BLOCKS.map(block => {
                      const st = getEffectiveStatus(dateStr, block);
                      return (
                        <span
                          key={block}
                          title={`${BLOCK_LABELS[block]}: ${st}`}
                          style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: DOT_COLORS[st] ?? DOT_COLORS.unset,
                            display: 'inline-block',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            {Object.entries(DOT_COLORS).map(([key, color]) => (
              <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#555' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </span>
            ))}
          </div>
        </div>

        {/* Day detail panel */}
        {selectedDate && (
          <DayDetailPanel
            date={selectedDate}
            getEffectiveStatus={getEffectiveStatus}
            cycleBlock={cyclePendingBlock}
            hasPending={hasPendingForDate(selectedDate)}
            saving={saving}
            onSave={() => saveDay(selectedDate)}
          />
        )}
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 2: Add the DayDetailPanel component to the same file**

Append to `AdminAvailability.tsx` (above the `AdminAvailability` function, after the constants):

```tsx
interface DayDetailPanelProps {
  date: string;
  getEffectiveStatus: (date: string, block: string) => string;
  cycleBlock: (date: string, block: string) => void;
  hasPending: boolean;
  saving: boolean;
  onSave: () => void;
}

function DayDetailPanel({ date, getEffectiveStatus, cycleBlock, hasPending, saving, onSave }: DayDetailPanelProps) {
  const d = new Date(date + 'T00:00:00');
  const label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{
      background: '#fff', border: '1px solid rgba(0,0,0,0.06)',
      padding: '24px 24px 20px', flex: '0 0 280px', minWidth: 260,
    }}>
      <h2 style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#111', margin: '0 0 4px' }}>
        Edit Day
      </h2>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 20px' }}>{label}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {BLOCKS.map(block => {
          const status = getEffectiveStatus(date, block);
          const badge = STATUS_BADGE[status] ?? STATUS_BADGE.unset;
          const isBooked = status === 'booked';

          return (
            <div
              key={block}
              onClick={() => !isBooked && cycleBlock(date, block)}
              style={{
                border: `1px solid ${badge.bg === '#f3f4f6' ? '#e5e7eb' : badge.bg}`,
                background: badge.bg,
                borderRadius: 4, padding: '10px 14px',
                cursor: isBooked ? 'not-allowed' : 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                opacity: isBooked ? 0.7 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{BLOCK_LABELS[block]}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{BLOCK_TIMES[block]}</div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: badge.color, background: 'rgba(255,255,255,0.6)',
                padding: '3px 8px', borderRadius: 2,
              }}>
                {badge.label}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16 }}>
        <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 12px' }}>
          Click a block to cycle: not set → available → potential → unavailable → not set
        </p>
        <button
          onClick={onSave}
          disabled={saving || !hasPending}
          style={{
            width: '100%', padding: '9px 0',
            background: saving || !hasPending ? '#e5e7eb' : '#111',
            color: saving || !hasPending ? '#aaa' : '#fff',
            border: 'none', cursor: saving || !hasPending ? 'not-allowed' : 'pointer',
            fontFamily: "'Helvetica Neue', Arial, sans-serif",
            fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
            transition: 'background 0.2s',
          }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the file compiles**

```bash
cd client
npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors related to `AdminAvailability.tsx`.

---

## Task 5: Wire AdminAvailability into AdminLayout and App.tsx

**Files:**
- Modify: `client/src/app/components/admin/AdminLayout.tsx`
- Modify: `client/src/app/App.tsx`

- [ ] **Step 1: Add Availability tab to AdminLayout**

In `client/src/app/components/admin/AdminLayout.tsx`, replace the `TABS` array and type:

```tsx
type AdminTab = 'dashboard' | 'bookings' | 'availability' | 'editing' | 'service-area';

const TABS: { label: string; tab: AdminTab; path: string }[] = [
  { label: 'Dashboard',    tab: 'dashboard',    path: '/admin' },
  { label: 'Bookings',     tab: 'bookings',     path: '/admin/bookings' },
  { label: 'Availability', tab: 'availability', path: '/admin/availability' },
  { label: 'Editing',      tab: 'editing',      path: '/admin/editing' },
  { label: 'Service Area', tab: 'service-area', path: '/admin/service-area' },
];
```

- [ ] **Step 2: Add import and route in App.tsx**

In `client/src/app/App.tsx`, add the import:

```tsx
import { AdminAvailability } from './pages/admin/AdminAvailability';
```

Add the route inside the admin section (after the `/admin/bookings` route):

```tsx
<Route path="/admin/availability" element={
  <ProtectedRoute requireStaff>
    <AdminAvailability />
  </ProtectedRoute>
} />
```

- [ ] **Step 3: Verify dev server starts cleanly**

```bash
cd client
npm run dev 2>&1 | head -20
```
Expected: no compilation errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/app/components/admin/AdminLayout.tsx \
        client/src/app/pages/admin/AdminAvailability.tsx \
        client/src/app/App.tsx
git commit -m "feat: admin availability calendar page"
```

---

## Task 6: Final integration check

- [ ] **Step 1: Run the full backend test suite**

```bash
cd server
python manage.py test content -v 2
```
Expected: all tests pass (no failures, no errors).

- [ ] **Step 2: Smoke test the frontend**

Start both servers:
```bash
# Terminal 1
cd server && python manage.py runserver

# Terminal 2
cd client && npm run dev
```

1. Log in as a staff user → navigate to `/admin/availability`
2. Verify the Availability tab is active in the top nav
3. Click a day → day detail panel appears
4. Click a block → status cycles correctly (dots update immediately)
5. Click "Save Changes" → panel refreshes, dots persist after page reload

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -p
git commit -m "fix: availability calendar integration tweaks"
```
