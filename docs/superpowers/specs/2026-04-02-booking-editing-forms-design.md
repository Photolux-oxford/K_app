# Booking & Editing Request Forms Design

**Goal:** Allow logged-in customers to submit a booking request via a 3-step wizard (depends on the availability calendar) and submit an editing request via a single-page form with file uploads.

---

## 1. Booking Wizard (`/book`)

Three steps rendered as a single-page wizard with a progress bar. State is held in React component state — no URL changes between steps. Back/Next buttons navigate steps without re-fetching.

### Step 1 — Choose a slot

- Month calendar grid (same layout as admin, read-only)
- Fetches `GET /api/availability/?month=YYYY-MM` on mount and on month navigation
- Available (green) and potential (amber) dates are clickable; all others greyed out
- Clicking a date reveals a **block selector** below the calendar:
  - Shows all three blocks for that day
  - Available → selectable, green badge
  - Potential → selectable, amber badge + amber inline notice: *"This is a potential slot — Kay will reach out to confirm availability before this booking is finalised."*
  - Unavailable / booked → greyed out, non-clickable
- Selecting a block enables the Next button
- Selected slot (date + block + slot id) passed to Step 2

### Step 2 — Session details

Fields:
| Field | Input | Validation |
|---|---|---|
| Session type | `<select>`: Wedding / Portrait / Event / Landscape / Product | Required |
| Location | Text input | Required, max 300 chars |
| Postcode | Text input | Required; validated live against `POST /api/service-area/check/` on blur — shows green ✓ if within zone, red ✗ with message if outside |
| Notes | Textarea | Optional, max 1000 chars |

- Postcode outside service area shows an error and blocks Next
- Back button returns to Step 1 (preserves slot selection)
- Next enabled only when all required fields valid

### Step 3 — Confirm

- Summary card showing: date, time block (e.g. "Morning · 08:00–11:00"), session type, location, postcode
- If the selected slot is **potential**: amber notice box — *"This is a potential slot — Kay will reach out to confirm availability before this booking is finalised."*
- If the selected slot is **available**: green notice — *"Kay will review your request and confirm within 48 hours."*
- Submit button sends `POST /api/bookings/` (see below)
- On success: redirect to `/dashboard` with a success toast

### Booking submission

```
POST /api/bookings/
```
**Body:**
```json
{
  "slot_id": 42,
  "session_type": "portrait",
  "location": "Christchurch Meadow, Oxford",
  "postcode": "OX1 1NE",
  "notes": "..."
}
```
**Backend behaviour:**
- Uses `select_for_update()` on the slot to prevent race conditions (two customers booking the same slot simultaneously)
- Validates slot exists and is not `is_booked`
- Creates `BookingRequest` with `status='pending'`
- Sets `slot.is_booked = True`
- Returns `{ "id": ..., "status": "pending" }`
- If slot is already booked by the time the transaction runs: returns 409 Conflict

**Permission:** `IsAuthenticated`

---

## 2. Editing Request Form (`/editing`)

Single-page form — no wizard, all fields visible at once.

### Fields

| Field | Input | Validation |
|---|---|---|
| Style notes | Textarea (min 3 rows) | Required, max 2000 chars |
| Turnaround expectation | Text input | Required, max 200 chars — free text, e.g. "within 2 weeks" |
| Photos | Drag-and-drop upload zone | Required, at least 1 file |

### File upload behaviour
- Accepts: JPG, PNG, TIFF, RAW (CR2, NEF, ARW), max 25 MB per file
- Files upload immediately on drop/select via `POST /api/editing-requests/{id}/files/` (after request created) — OR held client-side until form submission, then uploaded in sequence
- Upload zone shows per-file progress bars and individual remove (✕) buttons
- Failed uploads shown in red with a retry button

**Implementation choice:** Upload files after the request is created (two-step: create request → upload files). This avoids holding large files in memory before submission.

### "What happens next" sidebar
Static informational panel:
1. Kay reviews your photos and style notes
2. You receive a price quote via message
3. Once agreed, editing begins
4. Edited photos delivered within your chosen turnaround

Plus a pricing note: *"Prices are set by Kay based on the number of photos and complexity of edits. You'll receive a quote before any work begins."*

### Submission flow
1. `POST /api/editing-requests/` with `{ style_notes, turnaround }` → returns `{ id }`
2. For each file: `POST /api/editing-requests/{id}/files/` (multipart form)
3. On all uploads complete: redirect to `/dashboard` with success toast

**Permission:** `IsAuthenticated`

### Backend endpoints

```
POST /api/editing-requests/                  { style_notes, turnaround }
POST /api/editing-requests/{id}/files/       multipart: file
```

---

## 3. Backend Endpoints Summary

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/availability/` | Public | `?month=YYYY-MM`, returns available + potential slots only |
| POST | `/api/bookings/` | IsAuthenticated | Creates BookingRequest, marks slot as booked |
| POST | `/api/editing-requests/` | IsAuthenticated | Creates EditingRequest |
| POST | `/api/editing-requests/{id}/files/` | IsAuthenticated | Uploads a file for the request |

---

## 4. Dashboard stub (`/dashboard`)

Not in scope for this plan beyond being a landing page after successful submission. Both booking and editing submissions redirect here with a toast notification.

---

## 5. File Map

### Backend — new/modified
| File | Change |
|---|---|
| `server/content/views.py` | Add `customer_availability`, `create_booking`, `create_editing_request`, `upload_editing_file` |
| `server/content/urls.py` | Register new customer routes |

### Frontend — new/modified
| File | Change |
|---|---|
| `client/src/app/pages/BookPage.tsx` | 3-step booking wizard |
| `client/src/app/pages/EditingPage.tsx` | Single-page editing form |
| `client/src/app/App.tsx` | Replace `/book` and `/editing` ComingSoon stubs |

---

## 6. Out of Scope

- Payment flow — deferred to a later plan
- Customer dashboard beyond redirect landing — deferred
- Email notifications to customer on booking submission
- Editing file delivery mechanism (how Kay sends edited files back)
