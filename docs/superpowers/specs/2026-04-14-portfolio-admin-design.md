# Portfolio Admin Design

**Goal:** Give Kay a full portfolio management interface inside the existing admin panel — upload photos, assign categories, curate what appears in the public grid and hero slideshow, and manage categories — all without touching the Django admin.

---

## 1. Overview

The admin panel gets a new **Portfolio** tab. Inside it are four sub-tabs:

- **Library** — upload photos, assign categories, toggle published state, delete
- **Grid** — drag-to-reorder published photos within each category (controls public display order)
- **Hero** — assign photos to up to 6 numbered hero slideshow slots
- **Categories** — add, rename, and delete categories

The public `Portfolio` component and `Hero` component are updated to fetch from the API instead of using hardcoded placeholders.

---

## 2. Data Model

### 2.1 Category (new model)

Replaces the hardcoded `category` choices on `PortfolioItem`.

```python
class Category(models.Model):
    name  = models.CharField(max_length=100, unique=True)
    slug  = models.SlugField(max_length=100, unique=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'name']

    def __str__(self):
        return self.name
```

Slug is auto-generated from name on save (no manual input required).

### 2.2 PortfolioItem (modified)

Current fields: `title`, `category` (CharField choices), `image`, `featured`, `order`, `created_at`.

Changes:
- Remove `featured` (replaced by `HeroSlot`)
- Remove `category` CharField — replace with `category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL)`
- Add `published = models.BooleanField(default=False)`
- Keep `order` and `created_at`
- Add `title` as optional (blank=True) — on upload, if `title` is not provided, the server sets it to the uploaded filename without extension

```python
class PortfolioItem(models.Model):
    title     = models.CharField(max_length=200, blank=True)
    category  = models.ForeignKey('Category', null=True, blank=True, on_delete=models.SET_NULL, related_name='items')
    image     = models.ImageField(upload_to='portfolio/')
    published = models.BooleanField(default=False)
    order     = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', '-created_at']
```

### 2.3 HeroSlot (new model)

```python
class HeroSlot(models.Model):
    slot_number    = models.PositiveSmallIntegerField(unique=True)  # 1–6
    portfolio_item = models.ForeignKey(PortfolioItem, null=True, blank=True, on_delete=models.SET_NULL, related_name='hero_slots')

    class Meta:
        ordering = ['slot_number']
```

Six rows pre-seeded in a data migration (slot_number 1–6, portfolio_item=null). Deleting a photo sets its hero slot to null via `SET_NULL`.

---

## 3. Backend — Migrations

1. Create `Category` model
2. Add `published` to `PortfolioItem`, remove `featured`, replace `category` CharField with FK
3. Create `HeroSlot` model with data migration seeding slots 1–6
4. Existing `PortfolioItem` rows: migrate their `category` string to `Category` FK rows; set `published=True` for all existing items (so nothing disappears on upgrade)

---

## 4. Backend — REST API

All endpoints require `IsAuthenticated` + `is_staff` except the public ones noted.

### 4.1 Categories

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/portfolio/categories/` | List all categories (id, name, slug, order, item_count) |
| POST | `/api/admin/portfolio/categories/` | Create category. Body: `{ name }`. Slug auto-generated. |
| PATCH | `/api/admin/portfolio/categories/<id>/` | Rename. Body: `{ name }`. Slug regenerated. |
| DELETE | `/api/admin/portfolio/categories/<id>/` | Delete. If any PortfolioItems reference it, items' category set to null first. Returns 200. |

### 4.2 Portfolio Items

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/portfolio/items/` | List all items. Optional: `?category=<id>`, `?published=true/false`. Returns id, title, image URL, category_id, category_name, published, order. |
| POST | `/api/admin/portfolio/items/` | Upload photo. Multipart: `image` (file), `category` (optional int), `title` (optional string). Returns created item. |
| PATCH | `/api/admin/portfolio/items/<id>/` | Update `category`, `published`, `title`, `order`. Partial update. |
| DELETE | `/api/admin/portfolio/items/<id>/` | Delete item + image file from disk. |
| POST | `/api/admin/portfolio/items/reorder/` | Bulk reorder. Body: `[{ id, order }, ...]`. Updates `order` on all specified items. |

File validation on upload: JPG, PNG, TIFF only. Max 25 MB. Same pattern as editing file uploads.

### 4.3 Hero Slots

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/portfolio/hero/` | Return all 6 slots: `[{ slot_number, portfolio_item: { id, image_url, title } or null }]` |
| PUT | `/api/admin/portfolio/hero/<slot_number>/` | Assign item to slot. Body: `{ portfolio_item_id }`. If item already in another slot, moves it. |
| DELETE | `/api/admin/portfolio/hero/<slot_number>/` | Clear slot (set portfolio_item to null). |

### 4.4 Public Endpoints (updated)

**GET /api/portfolio/** — unchanged URL, updated behaviour:
- Returns only `published=True` items
- Joins category name/slug
- Optional `?category=<slug>` filter
- Returns: `id`, `image_url`, `title`, `category_name`, `category_slug`, `order`

**GET /api/portfolio/hero/** — new public endpoint:
- Returns slots 1–6 in order, skipping empty slots
- Returns: `slot_number`, `image_url`, `title`

**GET /api/portfolio/categories/** — new public endpoint:
- Returns all categories that have at least one published item
- Returns: `id`, `name`, `slug`, `published_count`
- Used by the public Portfolio component to build the category filter pills

---

## 5. Frontend — Admin

### 5.1 AdminLayout update

Add `'portfolio'` to the `AdminTab` type. Add tab between Dashboard and Bookings:
```
Dashboard · Portfolio · Bookings · Availability · Messages · Editing · Service Area
```

### 5.2 File map

| File | Type | Description |
|---|---|---|
| `client/src/app/pages/admin/AdminPortfolio.tsx` | New | Outer page — wraps in AdminLayout, manages active sub-tab state |
| `client/src/app/components/admin/portfolio/LibraryTab.tsx` | New | Upload zone + photo grid + inline edit strip |
| `client/src/app/components/admin/portfolio/GridTab.tsx` | New | Category sub-tabs + drag-to-reorder published photos |
| `client/src/app/components/admin/portfolio/HeroTab.tsx` | New | 6 numbered slot cards + photo picker strip |
| `client/src/app/components/admin/portfolio/CategoriesTab.tsx` | New | Category list with inline rename, add, delete |
| `client/src/app/components/admin/AdminLayout.tsx` | Modified | Add `'portfolio'` tab |
| `client/src/app/App.tsx` | Modified | Add `/admin/portfolio` route |

### 5.3 AdminPortfolio page

Renders `AdminLayout activeTab="portfolio"`. Manages `activeSubTab` state (`'library' | 'grid' | 'hero' | 'categories'`). Renders inner tab bar, mounts the active sub-tab component.

### 5.4 LibraryTab

State: `items: PortfolioItem[]`, `categories: Category[]`, `filterCategory: number | null`, `filterPublished: boolean | null`, `selectedItem: PortfolioItem | null`, `uploading: { file: File, progress: number }[]`

Behaviour:
- Upload zone: `onDrop` / `onChange` triggers `POST /api/admin/portfolio/items/` for each file sequentially. Shows per-file progress bar while uploading.
- Photo grid: 6-column grid. Each cell shows image thumbnail, green/grey dot (published state), `HERO N` badge if assigned to any hero slot. Dimmed if no category.
- Click photo → sets `selectedItem` → shows edit strip at bottom.
- Edit strip: category dropdown (all categories + "No category"), published toggle, Save button (`PATCH /api/admin/portfolio/items/<id>/`), Delete button (confirm dialog → `DELETE /api/admin/portfolio/items/<id>/`).
- Filter bar: filter by category or by published state.

### 5.5 GridTab

State: `categories: Category[]`, `activeCategory: number`, `items: PortfolioItem[]` (published only, for active category)

Behaviour:
- Category pills across top. Click to switch. Only published items shown.
- Drag-to-reorder via HTML5 drag API: `draggable`, `onDragStart`, `onDragOver`, `onDrop`. On drop, recompute `order` values and call `POST /api/admin/portfolio/items/reorder/`.
- Visual drag feedback: dragged item shows at 0.5 opacity; drop target shows a highlighted gap.
- Saves automatically on drop (no separate Save button).

### 5.6 HeroTab

State: `slots: HeroSlot[]` (6 items), `libraryItems: PortfolioItem[]` (all published, for picker strip)

Behaviour:
- Top section: 6 slot cards in a row. Each shows slot number, assigned photo thumbnail, or dashed empty placeholder.
- Bottom section: scrollable strip of all published library photos.
- Drag a photo from the strip into a slot: HTML5 drag from strip item → drop onto slot card → `PUT /api/admin/portfolio/hero/<slot_number>/`. If slot was occupied, old assignment is replaced.
- Click the × on a filled slot → `DELETE /api/admin/portfolio/hero/<slot_number>/`.
- Drag a filled slot card onto another slot: moves the photo from the source slot into the target slot (source slot becomes empty, target slot gets the photo). Implemented as two sequential API calls: `DELETE /api/admin/portfolio/hero/<source>/` then `PUT /api/admin/portfolio/hero/<target>/`.

### 5.7 CategoriesTab

State: `categories: Category[]`, `editingId: number | null`, `editingName: string`, `newName: string`

Behaviour:
- Table: name | item count | published count | rename | delete
- Click rename → inline text input replaces the name, Save/Cancel buttons. `PATCH /api/admin/portfolio/categories/<id>/`.
- Delete → confirmation: "This will unassign N photos from this category. Continue?" → `DELETE /api/admin/portfolio/categories/<id>/`. Photos remain, just lose their category.
- Add new: input at bottom + Add button. `POST /api/admin/portfolio/categories/`.

---

## 6. Frontend — Public (updated)

### 6.1 Portfolio.tsx

Replace hardcoded placeholder fallback with real API data. Fetch `GET /api/portfolio/` for items and `GET /api/portfolio/categories/` for the filter pills. If the API returns an empty array, show a neutral empty state ("Portfolio coming soon") instead of placeholder images.

### 6.2 Hero.tsx

Replace hardcoded slides with `GET /api/portfolio/hero/`. Map response to slide objects. If API returns empty, fall back to a single solid-colour slide (no broken images). Auto-advance interval and GSAP animations unchanged.

---

## 7. Testing

### Backend
- `CategoryAPITests`: create, rename, delete (with and without assigned photos)
- `PortfolioItemAPITests`: upload (valid/invalid type/size), update, delete (file cleaned up), reorder
- `HeroSlotAPITests`: assign, clear, move between slots
- `PublicPortfolioAPITests`: only published items returned; hero endpoint returns slots in order

### Frontend
- No automated tests — manual smoke tests documented in the implementation plan

---

## 8. Out of Scope

- Image resizing or thumbnail generation (served at original size)
- CDN / cloud storage migration (stays on local filesystem for now)
- Watermarking
- Alt text / accessibility metadata on photos
- Bulk publish/unpublish
- Video support
