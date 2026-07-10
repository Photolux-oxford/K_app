# Availability Calendar Design

**Goal:** Give Kay a per-day, per-block calendar in the admin panel to manage her availability. Customers see a read-only version when booking.

---

## 1. Data Model

### AvailabilitySlot — extended

Add two fields to the existing model:

| Field | Type | Notes |
|---|---|---|
| `block` | CharField(10) | `'morning'` / `'afternoon'` / `'evening'` |
| `status` | CharField(15) | `'available'` / `'potential'` / `'unavailable'` |

**Fixed block definitions (hardcoded):**

| Block | Start | End |
|---|---|---|
| morning | 08:00 | 11:00 |
| afternoon | 12:00 | 15:00 |
| evening | 16:00 | 20:00 |

`start_time` and `end_time` are auto-filled from the block when a slot is created or updated — Kay never types times manually.

**Unique constraint:** `(date, block)` — replaces the existing `(date, start_time)` constraint. At most one row per day per block.

**`is_booked`:** unchanged — flips to `True` when a confirmed `BookingRequest` is linked.

**Rows only exist when Kay has set a status.** Unset blocks = no row. The frontend treats missing rows as "not set" (grey, non-clickable for customers).

### Migration

Add `block` and `status` fields with defaults, update the unique constraint, backfill `block` from existing `start_time` values where possible.

---

## 2. Backend Endpoints

All under `IsAdminUser` permission except the customer-facing GET.

```
GET  /api/admin/availability/?month=2026-04        → all slots for the month
POST /api/admin/availability/                       → create or update a slot
DELETE /api/admin/availability/{id}/               → remove a slot (set back to "not set")

GET  /api/availability/?month=2026-04              → customer-facing: returns only available + potential slots
```

**POST body:**
```json
{ "date": "2026-04-08", "block": "morning", "status": "available" }
```
If a slot for `(date, block)` already exists, upsert it. Returns the full slot object.

**Customer GET response:** returns available, potential, **and** booked slots (booked slots have `is_booked: true`). The frontend renders booked slots as "taken" (greyed out, non-clickable) so customers can see the day is partially occupied. Slots with no row in the DB are simply absent from the response — the frontend treats them as not set (grey, non-clickable).

---

## 3. Admin Calendar UI (`/admin/availability` — new tab)

### AdminLayout update
Add **Availability** as a fifth tab between Bookings and Editing:
`Dashboard · Bookings · Availability · Editing · Service Area`

### Month grid
- 7-column calendar grid, navigable by month (prev/next buttons)
- Each day cell shows **three dots** (morning / afternoon / evening), colour-coded:
  - Green (`#22c55e`) — available
  - Amber (`#f59e0b`) — potential
  - Red (`#ef4444`) — unavailable
  - Blue (`#3b82f6`) — booked (is_booked=True, read-only)
  - Grey (`#d1d5db`) — not set
- Clicking a day opens the day detail panel

### Day detail panel (right side, or inline below on small screens)
- Shows the selected date as a heading
- Three block rows: Morning 08:00–11:00 / Afternoon 12:00–15:00 / Evening 16:00–20:00
- Each row shows current status badge and is clickable
- Clicking a block **cycles**: not set → available → potential → unavailable → not set
- "Save changes" button sends one POST per changed block (upsert), DELETE for blocks cycled back to not set
- Optimistic UI: update local state immediately, revert on API error

---

## 4. Customer Calendar (embedded in booking wizard Step 1)

- Same month grid layout, read-only
- Only shows **available** (green) and **potential** (amber `~`) — all others are greyed out and non-clickable
- `is_booked=True` slots show as greyed out with "taken" label
- Clicking an available date reveals the block selector below the calendar
- Block selector shows only the available/potential blocks for that day; unavailable/booked blocks shown greyed out
- Selecting a potential block shows an inline amber notice:
  > "This is a potential slot — Kay will reach out to confirm availability before this booking is finalised."
- Selecting any block + clicking Next advances to Step 2

---

## 5. File Map

### Backend — new/modified
| File | Change |
|---|---|
| `server/content/models.py` | Add `block`, `status` to `AvailabilitySlot`; update unique constraint |
| `server/content/migrations/` | New migration |
| `server/content/views.py` | Add `admin_availability_list`, `admin_availability_upsert`, `admin_availability_delete`, `customer_availability` |
| `server/content/urls.py` | Register new routes |

### Frontend — new/modified
| File | Change |
|---|---|
| `client/src/app/components/admin/AdminLayout.tsx` | Add Availability tab |
| `client/src/app/pages/admin/AdminAvailability.tsx` | Month grid + day detail panel |
| `client/src/app/App.tsx` | Add `/admin/availability` route |

---

## 6. Out of Scope

- Email notifications when Kay changes slot status
- Recurring availability patterns (e.g. "every Monday morning")
- Customer-facing calendar as a standalone page — it only appears inside the booking wizard
