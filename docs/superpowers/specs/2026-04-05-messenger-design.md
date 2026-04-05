# Messenger Design

**Goal:** Real-time per-product messaging between Kay and customers, accessible from a dedicated `/messages` page (customer) and `/admin/messages` page (admin), with live unread badge in the header.

---

## 1. Overview

Each booking or editing request has its own message thread. Threads are identified by `(thread_type, thread_id)` — e.g. `('editing', 17)` or `('booking', 8)`. Kay and the customer can exchange messages within a thread. A pinned system message at the top of every thread summarises the product (auto-generated, not stored as a `Message` row — derived from the linked `BookingRequest` or `EditingRequest`).

Real-time delivery uses Django Channels + Redis. A second WebSocket connection per logged-in user provides live unread badge updates regardless of which page they are on.

---

## 2. Data Model

### Message model change

Replace `is_read: BooleanField` with `read_by_recipient: BooleanField(default=False)`.

**Definition of recipient:** the party who did *not* send the message. In a two-party thread (Kay ↔ one customer) this is unambiguous — if Kay sent it, the customer is the recipient; if the customer sent it, Kay is the recipient.

**Unread count for a user:**
- For a customer: `Message.objects.filter(thread_type=t, thread_id=id, read_by_recipient=False).exclude(sender=customer)`
- For Kay (staff): same filter excluding sender=Kay

No new models are required. Thread lists are derived by querying distinct `(thread_type, thread_id)` pairs from `Message` rows involving the current user.

---

## 3. Backend — REST API

All endpoints require `IsAuthenticated`. Customers see only their own threads/messages. Kay (staff) sees all.

| Method | Path | Description |
|---|---|---|
| GET | `/api/messages/threads/` | List all thread summaries for the current user. Returns grouped data (see below). |
| GET | `/api/messages/?thread_type=X&thread_id=Y` | All messages for a thread. Does not auto-mark as read — use `POST /api/messages/read/` for that. |
| POST | `/api/messages/` | Send a message. Body: `{ thread_type, thread_id, body }`. Broadcasts via WebSocket. |
| POST | `/api/messages/read/` | Explicitly mark all messages in a thread as read. Body: `{ thread_type, thread_id }`. |

**Thread summary response** (`GET /api/messages/threads/`):

For customers — grouped:
```json
{
  "editing": [
    {
      "thread_id": 17,
      "subject": "warm tones, natural light…",
      "last_message_body": "Kay: I've reviewed your photos",
      "last_message_at": "2026-04-05T14:32:00Z",
      "unread_count": 0
    }
  ],
  "booking": [
    {
      "thread_id": 8,
      "subject": "Portrait · Christchurch Meadow",
      "last_message_body": "Kay: Could we shift to 9am?",
      "last_message_at": "2026-04-04T10:15:00Z",
      "unread_count": 2
    }
  ]
}
```

For Kay (staff) — flat list sorted by `last_message_at` descending:
```json
[
  {
    "thread_type": "editing",
    "thread_id": 17,
    "customer_email": "javier@example.com",
    "subject": "warm tones, natural light…",
    "last_message_body": "Thanks, looking forward to it",
    "last_message_at": "2026-04-05T14:45:00Z",
    "unread_count": 1
  }
]
```

**Thread subject generation** (server-side helper, not stored):
- Editing: first 60 chars of `style_notes`
- Booking: `{session_type} · {location}`

**Auto-opener pinned message** (returned as the first item in the messages list, flagged `"is_system": true`, not a stored `Message` row):
- Editing: `"Editing Request #{id} — {style_notes}. Turnaround: {turnaround}. {file_count} photos uploaded."`
- Booking: `"Booking Request #{id} — {session_type} at {location} ({postcode}). Date: {slot_date} {slot_block}."`

---

## 4. Backend — WebSocket (Django Channels)

### Infrastructure

- Install: `channels`, `channels-redis`, `daphne`
- Add `daphne` and `channels` to `INSTALLED_APPS`
- Configure `CHANNEL_LAYERS` with Redis backend (default `redis://localhost:6379`)
- Update `asgi.py` to route HTTP → Django, WebSocket → Channels router

### Consumers

**`ChatConsumer`** — one per thread

- URL: `ws://.../ws/chat/{thread_type}/{thread_id}/?token=<jwt>`
- Channel group: `chat_{thread_type}_{thread_id}`
- On connect: authenticate JWT from query param; verify user has access to this thread — for customers: `EditingRequest.customer == user` (editing) or `BookingRequest.customer == user` (booking); for Kay: `user.is_staff`; reject with 4003 close code if unauthorised; join group
- On receive (from client): validate body non-empty; create `Message` in DB; broadcast to group: `{ type: "message", message: { id, sender_email, body, timestamp, is_own: bool } }`; push updated unread count to recipient's personal notification channel
- On disconnect: leave group

**`NotificationConsumer`** — one per logged-in user

- URL: `ws://.../ws/notifications/?token=<jwt>`
- Channel group: `user_{user_id}`
- On connect: authenticate JWT; join personal group; immediately send current total unread count
- Receives server-pushed frames only (no client→server messages expected): `{ type: "unread_count", count: N }`
- Triggered whenever: a new message is created for this user, or this user marks a thread as read

### Authentication

JWT token passed as query param `?token=...` on the WebSocket URL. The `ChatConsumer` and `NotificationConsumer` both validate this in `connect()` using `rest_framework_simplejwt`.

---

## 5. Frontend — Pages & Components

### File map

| File | Type | Description |
|---|---|---|
| `client/src/app/pages/MessagesPage.tsx` | New | Customer messenger — grouped sidebar + chat panel |
| `client/src/app/pages/admin/AdminMessages.tsx` | New | Kay's inbox — flat sidebar + chat panel, wrapped in `AdminLayout` |
| `client/src/app/components/ChatPanel.tsx` | New | Shared chat panel (thread header, auto-opener, message list, input) |
| `client/src/app/components/ThreadList.tsx` | New | Shared sidebar (grouped or flat depending on `grouped` prop) |
| `client/src/app/hooks/useChat.ts` | New | WebSocket for a thread — connects on mount, disconnects on unmount |
| `client/src/app/hooks/useNotifications.ts` | New | WebSocket for personal unread count |
| `client/src/app/context/NotificationContext.tsx` | New | Global unread count, consumed by Header badge |
| `client/src/app/components/Header.tsx` | Modified | Add Messages link (logged-in only) with unread badge |
| `client/src/app/components/admin/AdminLayout.tsx` | Modified | Add Messages tab with unread badge |
| `client/src/app/App.tsx` | Modified | Add `/messages` route (ProtectedRoute) and `/admin/messages` route (requireStaff) |

### Layout

Both pages use a two-column layout:
- **Sidebar**: fixed `260px` wide, scrollable, contains `ThreadList`
- **Chat panel**: `flex: 1`, takes all remaining width (~75–80% on a full browser), contains `ChatPanel`

### ThreadList component

Props:
```ts
interface ThreadListProps {
  grouped: boolean;           // true = customer view, false = admin flat view
  threads: ThreadSummary[];   // from GET /api/messages/threads/
  selectedKey: string | null; // "editing_17" format
  onSelect: (key: string) => void;
}
```

Each thread row shows:
- Thread label (e.g. `Editing · #17` or `Booking · #8`)
- Subject line (truncated)
- Last message preview (truncated, prefixed with "Kay:" or "You:" or customer email for admin)
- Timestamp (relative: "Today 14:32", "Yesterday", "3 Apr")
- Unread badge (black circle with count) if `unread_count > 0`
- Active thread: left border `2px solid #111`, white background

### ChatPanel component

Props:
```ts
interface ChatPanelProps {
  threadType: 'booking' | 'editing';
  threadId: number;
  isAdmin: boolean;
}
```

Sections:
1. **Thread header**: thread label + customer email (admin only) + subject + status + quoted price (editing only)
2. **Auto-opener**: grey pinned box with product summary (first item in message list, `is_system: true`)
3. **"New" divider**: horizontal rule labelled "New" inserted above the first unread message on initial load
4. **Message list**: sender bubbles — Kay/other = left-aligned grey; self = right-aligned black. Shows sender label + timestamp below each bubble.
5. **Input area**: textarea (multiline, Enter sends, Shift+Enter newline) + Send button

### useChat hook

```ts
function useChat(threadType: string, threadId: number): {
  messages: Message[];
  sendMessage: (body: string) => void;
  connected: boolean;
}
```

- Opens `ws://.../ws/chat/{threadType}/{threadId}/?token=...` on mount
- On WS message received: appends to local `messages` state
- `sendMessage`: sends `{ body }` via WebSocket (not via REST POST — the consumer handles DB write)
- Calls `POST /api/messages/read/` on mount to mark thread as read; triggers notification badge update

### useNotifications hook

```ts
function useNotifications(): { unreadCount: number }
```

- Opens `ws://.../ws/notifications/?token=...` on mount (called once inside `NotificationContext`)
- Updates `unreadCount` on every `unread_count` frame received
- Reconnects automatically on disconnect (exponential backoff, max 30s)

### NotificationContext

Wraps the app inside `AuthProvider`. Only connects the WebSocket when the user is authenticated. Exposes `{ unreadCount }` via `useContext(NotificationContext)`.

### Header badge

```tsx
{user && (
  <Link to="/messages">
    Messages
    {unreadCount > 0 && (
      <span style={{ /* small black circle */ }}>{unreadCount}</span>
    )}
  </Link>
)}
```

Same pattern added to the `AdminLayout` Messages tab.

### Admin Messages tab

Added to `AdminLayout` between Availability and Editing:
```
Dashboard · Bookings · Availability · Messages · Editing · Service Area
```

---

## 6. Routing

| Path | Component | Auth |
|---|---|---|
| `/messages` | `MessagesPage` | `ProtectedRoute` |
| `/messages?thread=editing_17` | `MessagesPage` (auto-selects thread) | `ProtectedRoute` |
| `/admin/messages` | `AdminMessages` | `ProtectedRoute requireStaff` |

Optional `?thread=type_id` query param allows linking directly to a specific thread from booking/editing confirmation pages in future.

---

## 7. Testing

### Backend
- `MessageModelTests`: `read_by_recipient` default False; unread count queries correct for both parties
- `MessageAPITests`: auth required; customer cannot read other customer's thread; send message creates DB row; read endpoint marks correct messages; staff can read all threads
- `WebSocketTests` (using `channels.testing.WebsocketCommunicator`): connect with valid JWT; reject invalid JWT; broadcast on send; unread count pushed to notification consumer on new message

### Frontend
- No frontend test framework — manual smoke tests only (documented in Task 6 of the plan)

---

## 8. Infrastructure notes

- Redis must be running locally for development: `redis-server` (default port 6379)
- `daphne` replaces `runserver` for WebSocket support: `daphne backend.asgi:application`
- For production: Redis as a managed service (e.g. Redis Cloud, AWS ElastiCache); `daphne` behind Nginx
- `.env` additions: `REDIS_URL=redis://localhost:6379`

---

## 9. Out of Scope

- File attachments in messages (deferred)
- Message editing or deletion
- Typing indicators
- Read receipts shown to the sender ("seen")
- Push notifications (browser or mobile)
- Message search
