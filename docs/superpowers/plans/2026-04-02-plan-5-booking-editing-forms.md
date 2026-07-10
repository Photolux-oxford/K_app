# Booking & Editing Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the customer-facing 3-step booking wizard (`/book`) and single-page editing request form (`/editing`) — both requiring login.

**Architecture:** Three new DRF endpoints behind `IsAuthenticated`: `POST /api/bookings/` (with `select_for_update()` race-condition protection), `POST /api/editing-requests/`, and `POST /api/editing-requests/{id}/files/`. Two new React pages replace the existing `ComingSoon` stubs. The booking wizard embeds the customer availability calendar (reads from `GET /api/availability/` added in Plan 4). File uploads use a two-step flow: create the editing request first, then upload files in sequence.

**Tech Stack:** Django REST Framework (`IsAuthenticated`), `django.db.transaction.atomic` + `select_for_update`, React + TypeScript, `api.ts` + `apiPostForm` fetch helpers, inline styles (Helvetica Neue, monochrome palette).

**Dependency:** Plan 4 (availability calendar) must be complete before starting this plan.

---

## File Map

### Backend — modified
| File | Change |
|---|---|
| `server/content/views.py` | Add `create_booking`, `create_editing_request`, `upload_editing_file` |
| `server/content/urls.py` | Register 3 new routes |
| `server/content/tests.py` | Add `CreateBookingAPITests`, `CreateEditingRequestAPITests` |

### Frontend — new/modified
| File | Change |
|---|---|
| `client/src/app/pages/BookPage.tsx` | New: 3-step booking wizard (slot picker → session details → confirm) |
| `client/src/app/pages/EditingPage.tsx` | New: single-page editing form with file upload |
| `client/src/app/App.tsx` | Replace `/book` and `/editing` ComingSoon stubs |

---

## Task 1: create_booking endpoint

**Files:**
- Modify: `server/content/views.py`
- Modify: `server/content/urls.py`
- Modify: `server/content/tests.py`

- [ ] **Step 1: Write the failing tests**

Add to `server/content/tests.py`:

```python
class CreateBookingAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.customer = User.objects.create_user(
            username='cust@test.com', email='cust@test.com', password='pass'
        )
        self.slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 10),
            block='morning',
            status='available',
        )

    def test_requires_authentication(self):
        res = self.client.post('/api/bookings/', {
            'slot_id': self.slot.id,
            'session_type': 'portrait',
            'location': 'Oxford',
            'postcode': 'OX1 1AA',
        }, format='json')
        self.assertEqual(res.status_code, 401)

    def test_creates_booking_and_marks_slot_booked(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/bookings/', {
            'slot_id': self.slot.id,
            'session_type': 'portrait',
            'location': 'Christchurch Meadow',
            'postcode': 'OX1 1AA',
            'notes': 'morning light preferred',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertIn('id', res.data)
        self.assertEqual(res.data['status'], 'pending')
        self.slot.refresh_from_db()
        self.assertTrue(self.slot.is_booked)

    def test_rejects_already_booked_slot(self):
        self.client.force_authenticate(user=self.customer)
        self.slot.is_booked = True
        self.slot.save()
        res = self.client.post('/api/bookings/', {
            'slot_id': self.slot.id,
            'session_type': 'portrait',
            'location': 'Oxford',
            'postcode': 'OX1 1AA',
        }, format='json')
        self.assertEqual(res.status_code, 409)

    def test_rejects_invalid_session_type(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/bookings/', {
            'slot_id': self.slot.id,
            'session_type': 'circus',
            'location': 'Oxford',
            'postcode': 'OX1 1AA',
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_rejects_missing_required_fields(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/bookings/', {
            'slot_id': self.slot.id,
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_rejects_nonexistent_slot(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/bookings/', {
            'slot_id': 99999,
            'session_type': 'portrait',
            'location': 'Oxford',
            'postcode': 'OX1 1AA',
        }, format='json')
        self.assertEqual(res.status_code, 404)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server
python manage.py test content.tests.CreateBookingAPITests -v 2
```
Expected: FAIL — view not defined.

- [ ] **Step 3: Add the view to `server/content/views.py`**

Add this import at the top of `views.py` (with the other imports):

```python
from django.db import transaction
from rest_framework.permissions import IsAuthenticated
```

Then add the view after `customer_availability`:

```python
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

    try:
        with transaction.atomic():
            slot = AvailabilitySlot.objects.select_for_update().get(pk=slot_id)
            if slot.is_booked:
                return Response({'error': 'This slot has already been booked.'}, status=409)

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
    except AvailabilitySlot.DoesNotExist:
        return Response({'error': 'Slot not found.'}, status=404)

    return Response({'id': booking.id, 'status': booking.status}, status=201)
```

- [ ] **Step 4: Register route in `server/content/urls.py`**

Add to `urlpatterns`:

```python
path('bookings/', views.create_booking),
```

- [ ] **Step 5: Run tests**

```bash
cd server
python manage.py test content.tests.CreateBookingAPITests -v 2
```
Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/content/views.py server/content/urls.py server/content/tests.py
git commit -m "feat: create booking endpoint with race condition protection"
```

---

## Task 2: create_editing_request and upload_editing_file endpoints

**Files:**
- Modify: `server/content/views.py`
- Modify: `server/content/urls.py`
- Modify: `server/content/tests.py`

- [ ] **Step 1: Write the failing tests**

Add to `server/content/tests.py`:

```python
import io
from django.core.files.uploadedfile import SimpleUploadedFile

class CreateEditingRequestAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.customer = User.objects.create_user(
            username='cust@test.com', email='cust@test.com', password='pass'
        )

    def test_requires_authentication(self):
        res = self.client.post('/api/editing-requests/', {
            'style_notes': 'warm tones', 'turnaround': '1 week'
        }, format='json')
        self.assertEqual(res.status_code, 401)

    def test_creates_editing_request(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/editing-requests/', {
            'style_notes': 'warm tones, natural light',
            'turnaround': 'within 2 weeks',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertIn('id', res.data)
        self.assertEqual(res.data['status'], 'requested')

    def test_rejects_missing_style_notes(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/editing-requests/', {
            'turnaround': '1 week'
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_rejects_missing_turnaround(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/editing-requests/', {
            'style_notes': 'warm tones'
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_upload_file_to_editing_request(self):
        self.client.force_authenticate(user=self.customer)
        editing = EditingRequest.objects.create(
            customer=self.customer,
            style_notes='test notes',
            turnaround='1 week',
        )
        fake_image = SimpleUploadedFile(
            'photo.jpg', b'fake-jpeg-content', content_type='image/jpeg'
        )
        res = self.client.post(
            f'/api/editing-requests/{editing.id}/files/',
            {'file': fake_image},
            format='multipart',
        )
        self.assertEqual(res.status_code, 201)
        self.assertIn('id', res.data)
        self.assertEqual(EditingFile.objects.filter(editing_request=editing).count(), 1)

    def test_upload_rejects_oversized_file(self):
        self.client.force_authenticate(user=self.customer)
        editing = EditingRequest.objects.create(
            customer=self.customer,
            style_notes='test notes',
            turnaround='1 week',
        )
        big_file = SimpleUploadedFile(
            'big.jpg',
            b'x' * (25 * 1024 * 1024 + 1),
            content_type='image/jpeg'
        )
        res = self.client.post(
            f'/api/editing-requests/{editing.id}/files/',
            {'file': big_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 400)

    def test_upload_rejects_disallowed_file_type(self):
        self.client.force_authenticate(user=self.customer)
        editing = EditingRequest.objects.create(
            customer=self.customer,
            style_notes='test notes',
            turnaround='1 week',
        )
        bad_file = SimpleUploadedFile(
            'virus.exe', b'bad content', content_type='application/octet-stream'
        )
        res = self.client.post(
            f'/api/editing-requests/{editing.id}/files/',
            {'file': bad_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 400)

    def test_upload_rejects_other_customers_request(self):
        other = User.objects.create_user(
            username='other@test.com', email='other@test.com', password='pass'
        )
        editing = EditingRequest.objects.create(
            customer=other,
            style_notes='test notes',
            turnaround='1 week',
        )
        self.client.force_authenticate(user=self.customer)
        fake_image = SimpleUploadedFile('photo.jpg', b'data', content_type='image/jpeg')
        res = self.client.post(
            f'/api/editing-requests/{editing.id}/files/',
            {'file': fake_image},
            format='multipart',
        )
        self.assertEqual(res.status_code, 404)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server
python manage.py test content.tests.CreateEditingRequestAPITests -v 2
```
Expected: FAIL — views not defined.

- [ ] **Step 3: Add the two views to `server/content/views.py`**

Add after `create_booking`:

```python
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_editing_request(request):
    style_notes = request.data.get('style_notes', '').strip()
    turnaround  = request.data.get('turnaround', '').strip()

    if not style_notes or not turnaround:
        return Response({'error': 'style_notes and turnaround are required.'}, status=400)

    editing = EditingRequest.objects.create(
        customer=request.user,
        style_notes=style_notes,
        turnaround=turnaround,
    )
    return Response({'id': editing.id, 'status': editing.status}, status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_editing_file(request, pk):
    import os
    try:
        editing = EditingRequest.objects.get(pk=pk, customer=request.user)
    except EditingRequest.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'file is required.'}, status=400)

    MAX_SIZE = 25 * 1024 * 1024  # 25 MB
    if file.size > MAX_SIZE:
        return Response({'error': 'File exceeds 25 MB limit.'}, status=400)

    allowed_exts = {'.jpg', '.jpeg', '.png', '.tiff', '.tif', '.cr2', '.nef', '.arw'}
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in allowed_exts:
        return Response(
            {'error': f'File type not allowed. Accepted: {", ".join(sorted(allowed_exts))}'},
            status=400
        )

    editing_file = EditingFile.objects.create(editing_request=editing, file=file)
    return Response({
        'id': editing_file.id,
        'file_name': os.path.basename(editing_file.file.name),
        'uploaded_at': editing_file.uploaded_at.isoformat(),
    }, status=201)
```

- [ ] **Step 4: Register routes in `server/content/urls.py`**

Add to `urlpatterns`:

```python
path('editing-requests/',                views.create_editing_request),
path('editing-requests/<int:pk>/files/', views.upload_editing_file),
```

- [ ] **Step 5: Run tests**

```bash
cd server
python manage.py test content.tests.CreateEditingRequestAPITests -v 2
```
Expected: all 8 tests pass.

- [ ] **Step 6: Run the full test suite**

```bash
cd server
python manage.py test content -v 2
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/content/views.py server/content/urls.py server/content/tests.py
git commit -m "feat: create editing request and file upload endpoints"
```

---

## Task 3: BookPage.tsx — 3-step booking wizard

**Files:**
- Create: `client/src/app/pages/BookPage.tsx`

- [ ] **Step 1: Create the file with shared types and the outer wizard shell**

Create `client/src/app/pages/BookPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface Slot {
  id: number;
  date: string;           // 'YYYY-MM-DD'
  block: 'morning' | 'afternoon' | 'evening';
  start_time: string;     // 'HH:MM'
  end_time: string;
  status: 'available' | 'potential';
  is_booked: boolean;
}

interface SelectedSlot {
  slot: Slot;
  dateLabel: string;      // e.g. "Wednesday 8 April 2026"
  blockLabel: string;     // e.g. "Morning · 08:00–11:00"
}

interface SessionDetails {
  session_type: string;
  location: string;
  postcode: string;
  notes: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const BLOCK_LABELS = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
const BLOCK_ORDER  = ['morning', 'afternoon', 'evening'] as const;
const SESSION_TYPES = ['Wedding', 'Portrait', 'Event', 'Landscape', 'Product'];
const MONTH_NAMES   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES     = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function toYYYYMM(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}
function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Outer wizard shell ───────────────────────────────────────────────────────

export function BookPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [details, setDetails] = useState<SessionDetails>({
    session_type: '', location: '', postcode: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!selectedSlot) return;
    setSubmitting(true);
    try {
      await api.post('/bookings/', {
        slot_id:      selectedSlot.slot.id,
        session_type: details.session_type.toLowerCase(),
        location:     details.location,
        postcode:     details.postcode,
        notes:        details.notes,
      });
      toast.success('Booking request submitted! Kay will confirm within 48 hours.');
      navigate('/dashboard');
    } catch (err: any) {
      if (err?.status === 409) {
        toast.error('Sorry — that slot was just taken. Please choose another.');
        setStep(1);
        setSelectedSlot(null);
      } else {
        toast.error('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#fafafa',
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      paddingTop: 80,
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#aaa', margin: '0 0 8px' }}>
            Book a Session
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 300, color: '#111', margin: 0, letterSpacing: '-0.01em' }}>
            {step === 1 ? 'Choose a date & time' : step === 2 ? 'Session details' : 'Confirm your request'}
          </h1>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 36 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              flex: 1, height: 2, borderRadius: 2,
              background: s <= step ? '#111' : '#e5e7eb',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Steps */}
        {step === 1 && (
          <StepOne
            onSelect={(slot) => { setSelectedSlot(slot); setStep(2); }}
          />
        )}
        {step === 2 && selectedSlot && (
          <StepTwo
            selectedSlot={selectedSlot}
            details={details}
            onChange={setDetails}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && selectedSlot && (
          <StepThree
            selectedSlot={selectedSlot}
            details={details}
            submitting={submitting}
            onBack={() => setStep(2)}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add StepOne to BookPage.tsx**

Append to `BookPage.tsx`:

```tsx
// ── Step 1: Slot picker ──────────────────────────────────────────────────────

interface StepOneProps {
  onSelect: (slot: SelectedSlot) => void;
}

function StepOne({ onSelect }: StepOneProps) {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const monthKey = toYYYYMM(year, month);

  useEffect(() => {
    setSelectedDate(null);
    setSelectedBlock(null);
    setLoading(true);
    api.get<Slot[]>(`/availability/?month=${monthKey}`)
      .then(data => { setSlots(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [monthKey]);

  // Group by date, keep only non-booked available/potential
  const slotsByDate: Record<string, Slot[]> = {};
  for (const s of slots) {
    if (!slotsByDate[s.date]) slotsByDate[s.date] = [];
    slotsByDate[s.date].push(s);
  }

  // A date is selectable if it has at least one non-booked available/potential slot
  function isDateSelectable(dateStr: string): boolean {
    return (slotsByDate[dateStr] ?? []).some(s => !s.is_booked);
  }

  const firstDayOfMonth = new Date(year, month - 1, 1);
  const daysInMonth     = new Date(year, month, 0).getDate();
  const startDow        = (firstDayOfMonth.getDay() + 6) % 7;

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  const daySlots = selectedDate ? (slotsByDate[selectedDate] ?? []) : [];

  function handleBlockSelect(slot: Slot) {
    setSelectedBlock(slot.block);
    const dateLabel  = formatDateLabel(slot.date);
    const blockLabel = `${BLOCK_LABELS[slot.block]} · ${slot.start_time}–${slot.end_time}`;
    onSelect({ slot, dateLabel, blockLabel });
  }

  return (
    <div>
      {/* Calendar */}
      <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '24px', marginBottom: 20 }}>
        {/* Nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button onClick={prevMonth} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#555', padding: '4px 8px' }}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.06em', color: '#111' }}>
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#555', padding: '4px 8px' }}>›</button>
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
          {DAY_NAMES.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#aaa', padding: '4px 0' }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        {loading ? (
          <p style={{ textAlign: 'center', color: '#bbb', fontSize: 13, padding: '20px 0' }}>Loading…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {Array.from({ length: startDow }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const dateStr    = toDateStr(year, month, day);
              const selectable = isDateSelectable(dateStr);
              const isSelected = selectedDate === dateStr;
              const daySlotList = slotsByDate[dateStr] ?? [];
              const hasAny = daySlotList.length > 0;

              return (
                <div
                  key={day}
                  onClick={() => selectable && setSelectedDate(isSelected ? null : dateStr)}
                  style={{
                    padding: '7px 4px 9px',
                    border: isSelected ? '2px solid #111' : '1px solid rgba(0,0,0,0.06)',
                    borderRadius: 4,
                    cursor: selectable ? 'pointer' : 'default',
                    background: isSelected ? '#fafafa' : '#fff',
                    textAlign: 'center',
                    opacity: !selectable && !hasAny ? 0.35 : 1,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: isSelected ? 600 : 400, color: selectable ? '#111' : '#bbb', marginBottom: 4 }}>
                    {day}
                  </div>
                  {/* Status dots */}
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                    {BLOCK_ORDER.map(block => {
                      const slot = daySlotList.find(s => s.block === block);
                      let color = '#e5e7eb';
                      if (slot) {
                        if (slot.is_booked)              color = '#93c5fd';
                        else if (slot.status === 'available') color = '#22c55e';
                        else if (slot.status === 'potential') color = '#f59e0b';
                      }
                      return <span key={block} style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block' }} />;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
          {[
            { color: '#22c55e', label: 'Available' },
            { color: '#f59e0b', label: 'Potential' },
            { color: '#93c5fd', label: 'Taken' },
          ].map(({ color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#777' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Block selector */}
      {selectedDate && (
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '20px 24px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', margin: '0 0 14px' }}>
            {formatDateLabel(selectedDate)} — choose a time
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {BLOCK_ORDER.map(block => {
              const slot = daySlots.find(s => s.block === block);
              const times: Record<string, string> = { morning: '08:00–11:00', afternoon: '12:00–15:00', evening: '16:00–20:00' };

              if (!slot || slot.is_booked) {
                return (
                  <div key={block} style={{
                    padding: '10px 14px', border: '1px solid #f0f0f0', borderRadius: 4,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    opacity: 0.4, cursor: 'not-allowed',
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{BLOCK_LABELS[block]}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{times[block]}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#aaa', background: '#f3f4f6', padding: '3px 8px', borderRadius: 2 }}>
                      {slot?.is_booked ? 'Taken' : 'Unavailable'}
                    </span>
                  </div>
                );
              }

              const isPotential = slot.status === 'potential';
              return (
                <div key={block}>
                  <div
                    onClick={() => handleBlockSelect(slot)}
                    style={{
                      padding: '10px 14px',
                      border: `1px solid ${isPotential ? '#fde68a' : '#bbf7d0'}`,
                      background: isPotential ? '#fffbeb' : '#f0fdf4',
                      borderRadius: 4,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{BLOCK_LABELS[block]}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{times[block]}</div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: isPotential ? '#92400e' : '#065f46',
                      background: isPotential ? '#fef3c7' : '#d1fae5',
                      padding: '3px 8px', borderRadius: 2,
                    }}>
                      {isPotential ? 'Potential ~' : 'Available'}
                    </span>
                  </div>
                  {isPotential && (
                    <p style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderTop: 'none', padding: '8px 14px', margin: 0, borderRadius: '0 0 4px 4px' }}>
                      This is a potential slot — Kay will reach out to confirm availability before this booking is finalised.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add StepTwo and StepThree to BookPage.tsx**

Append to `BookPage.tsx`:

```tsx
// ── Step 2: Session details ──────────────────────────────────────────────────

interface StepTwoProps {
  selectedSlot: SelectedSlot;
  details: SessionDetails;
  onChange: (d: SessionDetails) => void;
  onBack: () => void;
  onNext: () => void;
}

function StepTwo({ selectedSlot, details, onChange, onBack, onNext }: StepTwoProps) {
  const [postcodeStatus, setPostcodeStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [postcodeMsg, setPostcodeMsg]       = useState('');

  const checkPostcode = async (postcode: string) => {
    const trimmed = postcode.trim();
    if (!trimmed) return;
    setPostcodeStatus('checking');
    try {
      const res = await api.post<{ is_within_zone: boolean }>('/service-area/check/', { postcode: trimmed });
      if (res.is_within_zone) {
        setPostcodeStatus('valid');
        setPostcodeMsg('Within service area');
      } else {
        setPostcodeStatus('invalid');
        setPostcodeMsg('Outside service area — Kay does not cover this location');
      }
    } catch {
      setPostcodeStatus('invalid');
      setPostcodeMsg('Could not verify postcode — please check and try again');
    }
  };

  const canProceed =
    details.session_type &&
    details.location.trim() &&
    details.postcode.trim() &&
    postcodeStatus === 'valid';

  const inputStyle = {
    width: '100%', padding: '10px 12px',
    border: '1px solid rgba(0,0,0,0.12)',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    fontSize: 13, color: '#111', outline: 'none',
    boxSizing: 'border-box' as const,
  };
  const labelStyle = {
    fontSize: 10, fontWeight: 600 as const, letterSpacing: '0.1em',
    textTransform: 'uppercase' as const, color: '#888',
    display: 'block' as const, marginBottom: 6,
  };

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '28px 28px 24px' }}>
      {/* Slot summary */}
      <div style={{ background: '#f9f9f9', border: '1px solid #eee', padding: '10px 14px', marginBottom: 24, fontSize: 12, color: '#555' }}>
        📅 {selectedSlot.dateLabel} · {selectedSlot.blockLabel}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Session type */}
        <div>
          <label style={labelStyle}>Session Type</label>
          <select
            value={details.session_type}
            onChange={e => onChange({ ...details, session_type: e.target.value })}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">Select a type…</option>
            {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Location */}
        <div>
          <label style={labelStyle}>Location</label>
          <input
            type="text"
            value={details.location}
            onChange={e => onChange({ ...details, location: e.target.value })}
            placeholder="e.g. Christchurch Meadow, Oxford"
            maxLength={300}
            style={inputStyle}
          />
        </div>

        {/* Postcode */}
        <div>
          <label style={labelStyle}>Postcode</label>
          <input
            type="text"
            value={details.postcode}
            onChange={e => { onChange({ ...details, postcode: e.target.value }); setPostcodeStatus('idle'); }}
            onBlur={e => checkPostcode(e.target.value)}
            placeholder="OX1 1NE"
            maxLength={10}
            style={{
              ...inputStyle,
              borderColor: postcodeStatus === 'valid' ? '#22c55e' : postcodeStatus === 'invalid' ? '#ef4444' : 'rgba(0,0,0,0.12)',
            }}
          />
          {postcodeStatus === 'checking' && <p style={{ fontSize: 11, color: '#888', margin: '5px 0 0' }}>Checking…</p>}
          {postcodeStatus === 'valid'    && <p style={{ fontSize: 11, color: '#22c55e', margin: '5px 0 0' }}>✓ {postcodeMsg}</p>}
          {postcodeStatus === 'invalid'  && <p style={{ fontSize: 11, color: '#ef4444', margin: '5px 0 0' }}>✗ {postcodeMsg}</p>}
        </div>

        {/* Notes */}
        <div>
          <label style={labelStyle}>Notes (optional)</label>
          <textarea
            value={details.notes}
            onChange={e => onChange({ ...details, notes: e.target.value })}
            placeholder="Any specific requirements or ideas…"
            maxLength={1000}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        <button onClick={onBack} style={{
          flex: 1, padding: '10px 0', background: '#fff', color: '#111',
          border: '1px solid #ccc', cursor: 'pointer',
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
          fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>← Back</button>
        <button onClick={onNext} disabled={!canProceed} style={{
          flex: 2, padding: '10px 0',
          background: canProceed ? '#111' : '#e5e7eb',
          color: canProceed ? '#fff' : '#aaa',
          border: 'none', cursor: canProceed ? 'pointer' : 'not-allowed',
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
          fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
          transition: 'background 0.2s',
        }}>Next →</button>
      </div>
    </div>
  );
}

// ── Step 3: Confirm ──────────────────────────────────────────────────────────

interface StepThreeProps {
  selectedSlot: SelectedSlot;
  details: SessionDetails;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

function StepThree({ selectedSlot, details, submitting, onBack, onSubmit }: StepThreeProps) {
  const isPotential = selectedSlot.slot.status === 'potential';
  const rows = [
    { label: 'Date',     value: selectedSlot.dateLabel },
    { label: 'Time',     value: selectedSlot.blockLabel },
    { label: 'Session',  value: details.session_type },
    { label: 'Location', value: details.location },
    { label: 'Postcode', value: details.postcode },
    ...(details.notes ? [{ label: 'Notes', value: details.notes }] : []),
  ];

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '28px 28px 24px' }}>
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888', margin: '0 0 20px' }}>
        Review your request
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 20 }}>
        {rows.map(({ label, value }, i) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '10px 0',
            borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none',
          }}>
            <span style={{ fontSize: 12, color: '#888', minWidth: 80 }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#111', textAlign: 'right', maxWidth: 340 }}>{value}</span>
          </div>
        ))}
      </div>

      {isPotential ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '10px 14px', marginBottom: 20, fontSize: 11, color: '#92400e', borderRadius: 3 }}>
          ⚠ This is a potential slot — Kay will reach out to confirm availability before this booking is finalised.
        </div>
      ) : (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', marginBottom: 20, fontSize: 11, color: '#166534', borderRadius: 3 }}>
          Kay will review your request and confirm within 48 hours.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onBack} disabled={submitting} style={{
          flex: 1, padding: '10px 0', background: '#fff', color: '#111',
          border: '1px solid #ccc', cursor: submitting ? 'not-allowed' : 'pointer',
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
          fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>← Back</button>
        <button onClick={onSubmit} disabled={submitting} style={{
          flex: 2, padding: '10px 0',
          background: submitting ? '#e5e7eb' : '#111',
          color: submitting ? '#aaa' : '#fff',
          border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
          fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
          transition: 'background 0.2s',
        }}>
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify the file compiles**

```bash
cd client
npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors related to `BookPage.tsx`.

---

## Task 4: EditingPage.tsx — single-page form with file upload

**Files:**
- Create: `client/src/app/pages/EditingPage.tsx`

- [ ] **Step 1: Create the file**

Create `client/src/app/pages/EditingPage.tsx`:

```tsx
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, apiPostForm } from '../lib/api';

interface UploadedFile {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;  // 0-100 (simulated — fetch doesn't expose XHR progress)
  errorMsg?: string;
}

const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.cr2', '.nef', '.arw'];
const MAX_SIZE_MB  = 25;

function getExt(name: string) {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

function validateFile(file: File): string | null {
  if (!ALLOWED_EXTS.includes(getExt(file.name))) {
    return `${file.name}: file type not allowed (accepted: JPG, PNG, TIFF, RAW)`;
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `${file.name}: exceeds ${MAX_SIZE_MB} MB limit`;
  }
  return null;
}

export function EditingPage() {
  const [styleNotes,  setStyleNotes]  = useState('');
  const [turnaround,  setTurnaround]  = useState('');
  const [files,       setFiles]       = useState<UploadedFile[]>([]);
  const [dragOver,    setDragOver]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate     = useNavigate();

  function addFiles(newFiles: FileList | File[]) {
    const additions: UploadedFile[] = [];
    for (const f of Array.from(newFiles)) {
      const err = validateFile(f);
      if (err) { toast.error(err); continue; }
      // Avoid duplicates by name+size
      if (files.some(u => u.file.name === f.name && u.file.size === f.size)) continue;
      additions.push({ file: f, status: 'pending', progress: 0 });
    }
    setFiles(prev => [...prev, ...additions]);
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }

  const canSubmit = styleNotes.trim() && turnaround.trim() && files.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      // Step 1: Create the editing request
      const { id } = await api.post<{ id: number; status: string }>(
        '/editing-requests/',
        { style_notes: styleNotes.trim(), turnaround: turnaround.trim() }
      );

      // Step 2: Upload each file in sequence
      for (let i = 0; i < files.length; i++) {
        setFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'uploading', progress: 50 } : f
        ));
        try {
          const formData = new FormData();
          formData.append('file', files[i].file);
          await apiPostForm(`/editing-requests/${id}/files/`, formData);
          setFiles(prev => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'done', progress: 100 } : f
          ));
        } catch {
          setFiles(prev => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'error', progress: 0, errorMsg: 'Upload failed' } : f
          ));
        }
      }

      toast.success('Editing request submitted! Kay will review and send you a quote.');
      navigate('/dashboard');
    } catch {
      toast.error('Failed to submit request. Please try again.');
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px',
    border: '1px solid rgba(0,0,0,0.12)',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    fontSize: 13, color: '#111', outline: 'none',
    boxSizing: 'border-box' as const,
  };
  const labelStyle = {
    fontSize: 10, fontWeight: 600 as const, letterSpacing: '0.1em',
    textTransform: 'uppercase' as const, color: '#888',
    display: 'block' as const, marginBottom: 6,
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#fafafa',
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      paddingTop: 80,
    }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#aaa', margin: '0 0 8px' }}>
            Photo Editing
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 300, color: '#111', margin: 0, letterSpacing: '-0.01em' }}>
            Submit photos for editing
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Form */}
          <div style={{ flex: '1 1 480px', background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '28px 28px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Style notes */}
              <div>
                <label style={labelStyle}>Editing Style & Instructions</label>
                <textarea
                  value={styleNotes}
                  onChange={e => setStyleNotes(e.target.value)}
                  placeholder="Describe the look you're after — e.g. warm tones, black & white, natural light, remove blemishes…"
                  maxLength={2000}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Turnaround */}
              <div>
                <label style={labelStyle}>Turnaround Expectation</label>
                <input
                  type="text"
                  value={turnaround}
                  onChange={e => setTurnaround(e.target.value)}
                  placeholder="e.g. within 2 weeks, no rush, by 15 May"
                  maxLength={200}
                  style={inputStyle}
                />
              </div>

              {/* File upload */}
              <div>
                <label style={labelStyle}>Upload Photos</label>

                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? '#111' : '#d1d5db'}`,
                    borderRadius: 4, padding: '28px 16px', textAlign: 'center',
                    background: dragOver ? '#f9f9f9' : '#fafafa',
                    cursor: 'pointer', marginBottom: 12,
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>📁</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#555' }}>Drag & drop photos here</div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>or click to browse</div>
                  <div style={{ fontSize: 10, color: '#bbb', marginTop: 6 }}>
                    JPG, PNG, TIFF, RAW · Max {MAX_SIZE_MB} MB per file
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ALLOWED_EXTS.join(',')}
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                />

                {/* File list */}
                {files.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {files.map((uf, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 10px',
                        background: uf.status === 'error' ? '#fef2f2' : uf.status === 'done' ? '#f0fdf4' : '#fff',
                        border: `1px solid ${uf.status === 'error' ? '#fca5a5' : uf.status === 'done' ? '#bbf7d0' : '#e5e7eb'}`,
                        borderRadius: 3, fontSize: 11,
                      }}>
                        <span style={{ color: uf.status === 'error' ? '#dc2626' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                          📷 {uf.file.name}
                          <span style={{ color: '#aaa', marginLeft: 6 }}>· {(uf.file.size / 1024 / 1024).toFixed(1)} MB</span>
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          {uf.status === 'uploading' && (
                            <div style={{ width: 60, height: 3, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${uf.progress}%`, height: '100%', background: '#111', transition: 'width 0.3s' }} />
                            </div>
                          )}
                          {uf.status === 'done'     && <span style={{ color: '#22c55e', fontSize: 12 }}>✓</span>}
                          {uf.status === 'error'    && <span style={{ color: '#ef4444', fontSize: 11 }}>{uf.errorMsg}</span>}
                          {uf.status !== 'uploading' && uf.status !== 'done' && (
                            <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>✕</button>
                          )}
                        </div>
                      </div>
                    ))}
                    <p style={{ fontSize: 11, color: '#aaa', margin: '6px 0 0' }}>
                      {files.length} file{files.length !== 1 ? 's' : ''} selected
                    </p>
                  </div>
                )}
              </div>

            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                width: '100%', padding: '12px 0', marginTop: 24,
                background: canSubmit ? '#111' : '#e5e7eb',
                color: canSubmit ? '#fff' : '#aaa',
                border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed',
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontSize: 12, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase',
                transition: 'background 0.2s',
              }}
            >
              {submitting ? 'Submitting…' : 'Submit Editing Request'}
            </button>
          </div>

          {/* Sidebar */}
          <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '20px 20px 18px' }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888', margin: '0 0 14px' }}>What happens next</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Kay reviews your photos and style notes',
                  'You receive a price quote via message',
                  'Once agreed, editing begins',
                  'Edited photos delivered within your chosen turnaround',
                ].map((text, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ width: 18, height: 18, background: '#111', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 12, color: '#555', lineHeight: 1.5 }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '18px 20px', fontSize: 11, color: '#777', lineHeight: 1.6 }}>
              Prices are set by Kay based on the number of photos and complexity of edits. You'll receive a quote before any work begins.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd client
npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors.

---

## Task 5: Wire BookPage and EditingPage into App.tsx

**Files:**
- Modify: `client/src/app/App.tsx`

- [ ] **Step 1: Add imports**

In `client/src/app/App.tsx`, add:

```tsx
import { BookPage }    from './pages/BookPage';
import { EditingPage } from './pages/EditingPage';
```

- [ ] **Step 2: Replace the ComingSoon stubs**

Replace:
```tsx
<Route path="/book"    element={<ProtectedRoute><ComingSoon label="Book a Session" /></ProtectedRoute>} />
<Route path="/editing" element={<ProtectedRoute><ComingSoon label="Photo Editing" /></ProtectedRoute>} />
```

With:
```tsx
<Route path="/book"    element={<ProtectedRoute><BookPage /></ProtectedRoute>} />
<Route path="/editing" element={<ProtectedRoute><EditingPage /></ProtectedRoute>} />
```

- [ ] **Step 3: Verify dev server starts cleanly**

```bash
cd client
npm run dev 2>&1 | head -20
```
Expected: no compilation errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/app/pages/BookPage.tsx \
        client/src/app/pages/EditingPage.tsx \
        client/src/app/App.tsx
git commit -m "feat: booking wizard and editing request form"
```

---

## Task 6: Final integration check

- [ ] **Step 1: Run the full backend test suite**

```bash
cd server
python manage.py test content -v 2
```
Expected: all tests pass.

- [ ] **Step 2: Smoke test the booking wizard**

Start both servers:
```bash
# Terminal 1
cd server && python manage.py runserver

# Terminal 2
cd client && npm run dev
```

1. Log in as a non-staff user
2. Navigate to `/book`
3. Verify calendar loads and shows available slots
4. Select an available date → block selector appears
5. Select a block → advances to Step 2
6. Fill in session type, location, postcode → verify postcode check triggers on blur
7. Invalid postcode → Next button stays disabled
8. Valid Oxford postcode → Next enabled → advances to Step 3
9. Step 3 shows summary card → submit → redirected to `/dashboard` with toast

- [ ] **Step 3: Smoke test the editing form**

1. Navigate to `/editing`
2. Drag or select photo files → file list appears with remove buttons
3. Fill in style notes and turnaround
4. Submit → files upload in sequence → redirect to `/dashboard` with toast

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -p
git commit -m "fix: booking/editing form integration tweaks"
```
