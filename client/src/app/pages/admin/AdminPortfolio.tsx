import { useCallback, useEffect, useState, type DragEvent, type MouseEvent } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { HomepagePreview } from '../../components/admin/HomepagePreview';
import { HomepagePreviewModal } from '../../components/admin/HomepagePreviewModal';
import {
  buildPreviewFromAdmin,
  type AdminCategory,
  type AdminHeroSlot,
  type AdminPortfolioItem,
} from '../../components/admin/portfolioPreviewUtils';
import { api, apiPostForm } from '../../lib/api';
import { preparePortfolioImage } from '../../lib/preparePortfolioImage';

type SubTab = 'library' | 'grid' | 'hero' | 'categories' | 'preview';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'grid', label: 'Grid' },
  { id: 'hero', label: 'Hero' },
  { id: 'categories', label: 'Categories' },
  { id: 'preview', label: 'Preview' },
];

export function AdminPortfolio() {
  const [subTab, setSubTab] = useState<SubTab>('library');
  const [items, setItems] = useState<AdminPortfolioItem[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [slots, setSlots] = useState<AdminHeroSlot[]>([]);
  const [draftItem, setDraftItem] = useState<AdminPortfolioItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('Homepage preview');

  const loadAll = useCallback(async () => {
    const [itemsRes, catsRes, slotsRes] = await Promise.all([
      api.get<AdminPortfolioItem[]>('/admin/portfolio/items/'),
      api.get<AdminCategory[]>('/admin/portfolio/categories/'),
      api.get<AdminHeroSlot[]>('/admin/portfolio/hero/'),
    ]);
    setItems(itemsRes);
    setCategories(catsRes);
    setSlots(slotsRes);
    return { items: itemsRes, categories: catsRes, slots: slotsRes };
  }, []);

  useEffect(() => { loadAll().catch(() => {}); }, [loadAll]);

  const previewData = buildPreviewFromAdmin(items, categories, slots, draftItem);

  const openPreviewModal = (title?: string) => {
    setModalTitle(title ?? 'Homepage preview');
    setModalOpen(true);
  };

  return (
    <AdminLayout activeTab="portfolio">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 300, margin: '0 0 8px' }}>Portfolio</h1>
          <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
            Manage homepage photos. Use Preview to see the public site before saving.
          </p>
        </div>
        <button type="button" onClick={() => openPreviewModal()} style={btnPrimary}>
          Preview homepage
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}>
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            style={{
              padding: '8px 16px', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
              border: subTab === t.id ? '1px solid #111' : '1px solid #ddd',
              background: subTab === t.id ? '#111' : '#fff',
              color: subTab === t.id ? '#fff' : '#666', cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'library' && (
        <LibraryTab
          items={items}
          categories={categories}
          slots={slots}
          loadAll={loadAll}
          draftItem={draftItem}
          setDraftItem={setDraftItem}
          onPreview={() => openPreviewModal(draftItem ? 'Preview with unsaved changes' : 'Homepage preview')}
        />
      )}
      {subTab === 'grid' && <GridTab categories={categories} loadItems={loadAll} />}
      {subTab === 'hero' && <HeroTab loadAll={loadAll} onPreview={() => openPreviewModal('Hero preview')} />}
      {subTab === 'categories' && <CategoriesTab loadCategories={loadAll} />}
      {subTab === 'preview' && (
        <div>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
            Live preview of the public homepage (hero + portfolio grid). Includes unsaved edits from Library.
          </p>
          <HomepagePreview
            heroSlides={previewData.heroSlides}
            portfolioItems={previewData.portfolioItems}
            categories={previewData.categories}
          />
        </div>
      )}

      <HomepagePreviewModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        heroSlides={previewData.heroSlides}
        portfolioItems={previewData.portfolioItems}
        categories={previewData.categories}
      />
    </AdminLayout>
  );
}

interface LibraryTabProps {
  items: AdminPortfolioItem[];
  categories: AdminCategory[];
  slots: AdminHeroSlot[];
  loadAll: () => Promise<unknown>;
  draftItem: AdminPortfolioItem | null;
  setDraftItem: (item: AdminPortfolioItem | null) => void;
  onPreview: () => void;
}

function LibraryTab({ items, categories, slots, loadAll, draftItem, setDraftItem, onPreview }: LibraryTabProps) {
  const [selected, setSelected] = useState<AdminPortfolioItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; url: string }[]>([]);
  const [uploadPreviewOpen, setUploadPreviewOpen] = useState(false);

  const selectedOrDraft = selected && draftItem?.id === selected.id ? draftItem : selected;

  const syncDraft = (item: AdminPortfolioItem) => {
    setSelected(item);
    setDraftItem(item);
  };

  const clearDraft = () => {
    setSelected(null);
    setDraftItem(null);
  };

  const onFilesChosen = (files: FileList | null) => {
    if (!files?.length) return;
    pendingFiles.forEach(p => URL.revokeObjectURL(p.url));
    const pending = Array.from(files).map(file => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPendingFiles(pending);
    setUploadPreviewOpen(true);
  };

  const cancelPendingUpload = () => {
    pendingFiles.forEach(p => URL.revokeObjectURL(p.url));
    setPendingFiles([]);
    setUploadPreviewOpen(false);
  };

  const confirmUpload = async () => {
    setUploading(true);
    try {
      for (const { file } of pendingFiles) {
        const prepared = await preparePortfolioImage(file);
        const fd = new FormData();
        fd.append('image', prepared);
        await apiPostForm('/admin/portfolio/items/', fd);
      }
      pendingFiles.forEach(p => URL.revokeObjectURL(p.url));
      setPendingFiles([]);
      setUploadPreviewOpen(false);
      await loadAll();
    } finally {
      setUploading(false);
    }
  };

  const saveSelected = async () => {
    if (!selectedOrDraft) return;
    await api.patch(`/admin/portfolio/items/${selectedOrDraft.id}/`, {
      category: selectedOrDraft.category_id,
      published: selectedOrDraft.published,
      title: selectedOrDraft.title,
    });
    await loadAll();
    clearDraft();
  };

  const deleteSelected = async () => {
    if (!selectedOrDraft || !confirm('Delete this photo?')) return;
    await api.delete(`/admin/portfolio/items/${selectedOrDraft.id}/`);
    clearDraft();
    await loadAll();
  };

  const pendingPreviewItems = pendingFiles.map((p, i) => ({
    id: `pending-${i}`,
    image_url: p.url,
    title: p.file.name.replace(/\.[^.]+$/, ''),
    category_name: null,
    category_slug: null,
  }));

  const uploadPreviewData = buildPreviewFromAdmin(items, categories, slots, null);

  return (
    <div>
      <label style={{
        display: 'block', border: '2px dashed #ccc', padding: 32, textAlign: 'center',
        cursor: uploading ? 'default' : 'pointer', marginBottom: 24,
      }}>
        <input
          type="file"
          accept="image/jpeg,image/png,image/tiff"
          multiple
          hidden
          disabled={uploading}
          onChange={e => {
            onFilesChosen(e.target.files);
            e.target.value = '';
          }}
        />
        {uploading ? 'Uploading…' : 'Drop or click to choose photos — optimized for web at full display quality'}
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => syncDraft(item)}
            style={{
              position: 'relative', padding: 0,
              border: selected?.id === item.id ? '2px solid #111' : '1px solid #eee',
              background: 'none', cursor: 'pointer', aspectRatio: '1', overflow: 'hidden',
              opacity: item.category_id ? 1 : 0.65,
            }}
          >
            {item.image_url && (
              <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
            <span style={{
              position: 'absolute', top: 4, left: 4, width: 8, height: 8, borderRadius: '50%',
              background: (draftItem?.id === item.id ? draftItem.published : item.published) ? '#22c55e' : '#ccc',
            }} />
            {item.hero_slot && (
              <span style={{
                position: 'absolute', bottom: 4, right: 4, fontSize: 8, background: '#111', color: '#fff',
                padding: '2px 4px', letterSpacing: '0.05em',
              }}>HERO {item.hero_slot}</span>
            )}
          </button>
        ))}
      </div>

      {selectedOrDraft && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff',
          borderTop: '1px solid #eee', padding: 16, display: 'flex', gap: 12, alignItems: 'center',
          flexWrap: 'wrap', zIndex: 100,
        }}>
          <select
            value={selectedOrDraft.category_id ?? ''}
            onChange={e => setDraftItem({
              ...selectedOrDraft,
              category_id: e.target.value ? Number(e.target.value) : null,
            })}
            style={{ padding: 8 }}
          >
            <option value="">No category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={selectedOrDraft.published}
              onChange={e => setDraftItem({ ...selectedOrDraft, published: e.target.checked })}
            />
            Published
          </label>
          <button type="button" onClick={onPreview} style={btnGhost}>Preview</button>
          <button type="button" onClick={saveSelected} style={btnPrimary}>Save</button>
          <button type="button" onClick={deleteSelected} style={btnDanger}>Delete</button>
          <button type="button" onClick={clearDraft} style={btnGhost}>Cancel</button>
        </div>
      )}

      <HomepagePreviewModal
        open={uploadPreviewOpen}
        onClose={cancelPendingUpload}
        title="Preview before upload"
        heroSlides={uploadPreviewData.heroSlides}
        portfolioItems={uploadPreviewData.portfolioItems}
        categories={uploadPreviewData.categories}
        pendingItems={pendingPreviewItems}
        footer={
          <>
            <button type="button" onClick={cancelPendingUpload} style={btnGhost}>Cancel</button>
            <button type="button" onClick={confirmUpload} disabled={uploading} style={btnPrimary}>
              {uploading ? 'Uploading…' : `Upload ${pendingFiles.length} photo(s)`}
            </button>
          </>
        }
      />
    </div>
  );
}

function GridTab({ categories, loadItems }: { categories: AdminCategory[]; loadItems: () => Promise<unknown> }) {
  const [activeCat, setActiveCat] = useState<number | null>(null);
  const [items, setItems] = useState<AdminPortfolioItem[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const cats = await api.get<AdminCategory[]>('/admin/portfolio/categories/');
    if (!activeCat && cats.length) setActiveCat(cats[0].id);
    const all = await api.get<AdminPortfolioItem[]>('/admin/portfolio/items/?published=true');
    setItems(all);
  }, [activeCat]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const catItems = items
    .filter(i => i.category_id === activeCat)
    .sort((a, b) => a.order - b.order);

  const onDrop = async (targetId: number) => {
    if (dragId === null || dragId === targetId) return;
    const reordered = [...catItems];
    const fromIdx = reordered.findIndex(i => i.id === dragId);
    const toIdx = reordered.findIndex(i => i.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    await api.post('/admin/portfolio/items/reorder/', reordered.map((item, idx) => ({ id: item.id, order: idx })));
    setDragId(null);
    await load();
    await loadItems();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {categories.map(c => (
          <button key={c.id} type="button" onClick={() => setActiveCat(c.id)} style={{
            padding: '6px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
            border: activeCat === c.id ? '1px solid #111' : '1px solid #ddd',
            background: activeCat === c.id ? '#111' : '#fff', color: activeCat === c.id ? '#fff' : '#666',
            cursor: 'pointer',
          }}>{c.name}</button>
        ))}
      </div>
      {!categories.length && <p style={{ color: '#888' }}>Add categories first.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {catItems.map(item => (
          <div
            key={item.id}
            draggable
            onDragStart={() => setDragId(item.id)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => onDrop(item.id)}
            style={{ opacity: dragId === item.id ? 0.5 : 1, aspectRatio: '1', cursor: 'grab' }}
          >
            {item.image_url && (
              <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroTab({ loadAll, onPreview }: { loadAll: () => Promise<unknown>; onPreview: () => void }) {
  const [slots, setSlots] = useState<AdminHeroSlot[]>([]);
  const [library, setLibrary] = useState<AdminPortfolioItem[]>([]);
  const [dragItemId, setDragItemId] = useState<number | null>(null);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickingFocalPoint, setPickingFocalPoint] = useState(false);

  const load = useCallback(async () => {
    const [s, items] = await Promise.all([
      api.get<AdminHeroSlot[]>('/admin/portfolio/hero/'),
      api.get<AdminPortfolioItem[]>('/admin/portfolio/items/?published=true'),
    ]);
    setSlots(s);
    setLibrary(items);
  }, []);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const assignToSlot = async (slotNumber: number, itemId: number) => {
    await api.put(`/admin/portfolio/hero/${slotNumber}/`, { portfolio_item_id: itemId });
    await load();
    await loadAll();
  };

  const clearSlot = async (slotNumber: number) => {
    await api.delete(`/admin/portfolio/hero/${slotNumber}/`);
    setEditingSlot(null);
    setPickingFocalPoint(false);
    await load();
    await loadAll();
  };

  const onSlotDrop = async (e: DragEvent, slotNumber: number) => {
    e.preventDefault();
    if (dragItemId) await assignToSlot(slotNumber, dragItemId);
    setDragItemId(null);
  };

  const patchSlot = async (slotNumber: number, data: { position_x?: number; position_y?: number; fit_mode?: string }) => {
    setSaving(true);
    try {
      await api.patch(`/admin/portfolio/hero/${slotNumber}/`, data);
      await load();
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const editSlot = editingSlot !== null ? slots.find(s => s.slot_number === editingSlot) : null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button type="button" onClick={onPreview} style={btnGhost}>Preview homepage</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
        {slots.map(slot => (
          <div
            key={slot.slot_number}
            onDragOver={e => e.preventDefault()}
            onDrop={e => onSlotDrop(e, slot.slot_number)}
            style={{
              aspectRatio: '16/9', border: editingSlot === slot.slot_number ? '2px solid #111' : '1px dashed #ccc',
              position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#000', overflow: 'hidden', cursor: slot.portfolio_item ? 'pointer' : 'default',
            }}
            onClick={() => {
              if (slot.portfolio_item) {
                setEditingSlot(slot.slot_number);
                setPickingFocalPoint(false);
              }
            }}
          >
            <span style={{
              position: 'absolute', top: 8, left: 8, fontSize: 10, color: '#fff',
              zIndex: 2, background: 'rgba(0,0,0,0.5)', padding: '2px 6px',
            }}>
              {slot.slot_number}
            </span>
            {slot.portfolio_item ? (
              <>
                <img
                  src={slot.portfolio_item.image_url} alt=""
                  style={{
                    width: '100%', height: '100%',
                    objectFit: slot.fit_mode,
                    objectPosition: `${slot.position_x}% ${slot.position_y}%`,
                  }}
                />
                <button type="button" onClick={e => { e.stopPropagation(); clearSlot(slot.slot_number); }} style={{
                  position: 'absolute', top: 4, right: 4, background: '#111', color: '#fff',
                  border: 'none', width: 20, height: 20, cursor: 'pointer', fontSize: 12, zIndex: 2,
                }}>×</button>
              </>
            ) : (
              <span style={{ fontSize: 11, color: '#666' }}>Empty</span>
            )}
          </div>
        ))}
      </div>

      {editSlot && editSlot.portfolio_item && (
        <div style={{
          border: '1px solid #e5e7eb', background: '#fafafa', padding: 24, marginBottom: 32,
        }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {/* Full-photo pick surface — natural aspect so click % matches object-position */}
            <div style={{ flexShrink: 0 }}>
              <p style={{
                fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase',
                margin: '0 0 8px',
              }}>
                Focal point
              </p>
              <div
                role={pickingFocalPoint ? 'button' : undefined}
                onClick={(e: MouseEvent<HTMLDivElement>) => {
                  if (!pickingFocalPoint || saving) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (rect.width <= 0 || rect.height <= 0) return;
                  const x = Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
                  const y = Math.round(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)));
                  setSlots(prev => prev.map(s =>
                    s.slot_number === editSlot.slot_number ? { ...s, position_x: x, position_y: y } : s
                  ));
                  void patchSlot(editSlot.slot_number, { position_x: x, position_y: y });
                }}
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  maxWidth: 320,
                  background: '#000',
                  cursor: pickingFocalPoint ? 'crosshair' : 'default',
                  outline: pickingFocalPoint ? '2px solid #111' : 'none',
                  outlineOffset: 2,
                }}
              >
                <img
                  src={editSlot.portfolio_item.image_url}
                  alt=""
                  draggable={false}
                  style={{
                    display: 'block',
                    maxWidth: 320,
                    maxHeight: 280,
                    width: 'auto',
                    height: 'auto',
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                />
                {/* Focal-point marker */}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: `${editSlot.position_x}%`,
                    top: `${editSlot.position_y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.95)',
                    border: '2px solid #111',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.6)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                />
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: `${editSlot.position_x}%`,
                    top: `${editSlot.position_y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.85)',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
              </div>
            </div>

            {/* Phone crop preview */}
            <div style={{ flexShrink: 0 }}>
              <p style={{
                fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase',
                margin: '0 0 8px',
              }}>
                Phone preview
              </p>
              <div style={{
                width: 150, aspectRatio: '9 / 16', background: '#000', overflow: 'hidden',
                position: 'relative', border: '1px solid #ddd',
              }}>
                <img
                  src={editSlot.portfolio_item.image_url}
                  alt=""
                  style={{
                    width: '100%', height: '100%',
                    objectFit: editSlot.fit_mode,
                    objectPosition: `${editSlot.position_x}% ${editSlot.position_y}%`,
                  }}
                />
              </div>
            </div>

            {/* Controls */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <h3 style={{
                fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                margin: '0 0 16px', color: '#111',
              }}>
                Slot {editSlot.slot_number} — {editSlot.portfolio_item.title || 'Untitled'}
              </h3>

              {/* Focal point picker toggle */}
              <div style={{ marginBottom: 20 }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setPickingFocalPoint(prev => !prev)}
                  style={{
                    padding: '8px 14px',
                    fontSize: 11,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    border: '1px solid #111',
                    background: pickingFocalPoint ? '#111' : '#fff',
                    color: pickingFocalPoint ? '#fff' : '#111',
                    cursor: 'pointer',
                  }}
                >
                  {pickingFocalPoint ? 'Picking… click the photo' : 'Set focal point'}
                </button>
                <p style={{ fontSize: 11, color: '#888', margin: '8px 0 0', lineHeight: 1.4 }}>
                  Click the face; phone preview shows the mobile crop.
                </p>
              </div>

              {/* Fit mode toggle */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, color: '#888', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Display mode
                </label>
                <div style={{ display: 'flex', gap: 0 }}>
                  {([['cover', 'Fill & Crop'], ['contain', 'Fit (black bars)']] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={saving}
                      onClick={() => patchSlot(editSlot.slot_number, { fit_mode: mode })}
                      style={{
                        padding: '6px 14px', fontSize: 11, letterSpacing: '0.06em',
                        border: '1px solid #ddd',
                        borderRight: mode === 'cover' ? 'none' : '1px solid #ddd',
                        background: editSlot.fit_mode === mode ? '#111' : '#fff',
                        color: editSlot.fit_mode === mode ? '#fff' : '#666',
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Horizontal position */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: '#888', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Horizontal position: {editSlot.position_x}%
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#bbb' }}>L</span>
                  <input
                    type="range" min={0} max={100} value={editSlot.position_x}
                    disabled={saving}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setSlots(prev => prev.map(s => s.slot_number === editSlot.slot_number ? { ...s, position_x: val } : s));
                    }}
                    onMouseUp={() => patchSlot(editSlot.slot_number, { position_x: editSlot.position_x })}
                    onTouchEnd={() => patchSlot(editSlot.slot_number, { position_x: editSlot.position_x })}
                    style={{ flex: 1, accentColor: '#111' }}
                  />
                  <span style={{ fontSize: 10, color: '#bbb' }}>R</span>
                </div>
              </div>

              {/* Vertical position */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, color: '#888', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Vertical position: {editSlot.position_y}%
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#bbb' }}>T</span>
                  <input
                    type="range" min={0} max={100} value={editSlot.position_y}
                    disabled={saving}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setSlots(prev => prev.map(s => s.slot_number === editSlot.slot_number ? { ...s, position_y: val } : s));
                    }}
                    onMouseUp={() => patchSlot(editSlot.slot_number, { position_y: editSlot.position_y })}
                    onTouchEnd={() => patchSlot(editSlot.slot_number, { position_y: editSlot.position_y })}
                    style={{ flex: 1, accentColor: '#111' }}
                  />
                  <span style={{ fontSize: 10, color: '#bbb' }}>B</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setPickingFocalPoint(false);
                    void patchSlot(editSlot.slot_number, { position_x: 50, position_y: 50, fit_mode: 'cover' });
                  }}
                  style={btnGhost}
                >
                  Reset to center
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPickingFocalPoint(false);
                    setEditingSlot(null);
                  }}
                  style={btnPrimary}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <p style={{ fontSize: 11, color: '#888', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        Drag a published photo into a slot{slots.some(s => s.portfolio_item) ? ' · click a slot to adjust position' : ''}
      </p>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
        {library.map(item => (
          <img
            key={item.id}
            src={item.image_url ?? ''}
            alt=""
            draggable
            onDragStart={() => setDragItemId(item.id)}
            style={{ width: 80, height: 80, objectFit: 'cover', cursor: 'grab', flexShrink: 0 }}
          />
        ))}
      </div>
    </div>
  );
}

function CategoriesTab({ loadCategories }: { loadCategories: () => Promise<unknown> }) {
  const [categories, setCategories] = useState<(AdminCategory & { item_count?: number; published_count?: number })[]>([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    setCategories(await api.get('/admin/portfolio/categories/'));
  }, []);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const addCategory = async () => {
    if (!newName.trim()) return;
    await api.post('/admin/portfolio/categories/', { name: newName.trim() });
    setNewName('');
    await load();
    await loadCategories();
  };

  const saveRename = async (id: number) => {
    await api.patch(`/admin/portfolio/categories/${id}/`, { name: editName.trim() });
    setEditingId(null);
    await load();
    await loadCategories();
  };

  const deleteCategory = async (cat: { id: number; name: string; item_count?: number }) => {
    const n = cat.item_count ?? 0;
    if (!confirm(`This will unassign ${n} photo(s) from "${cat.name}". Continue?`)) return;
    await api.delete(`/admin/portfolio/categories/${cat.id}/`);
    await load();
    await loadCategories();
  };

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #eee', textAlign: 'left' }}>
            <th style={{ padding: '8px 0' }}>Name</th>
            <th>Items</th>
            <th>Published</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {categories.map(cat => (
            <tr key={cat.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
              <td style={{ padding: '12px 0' }}>
                {editingId === cat.id ? (
                  <input value={editName} onChange={e => setEditName(e.target.value)} style={{ padding: 6, width: 200 }} />
                ) : cat.name}
              </td>
              <td>{cat.item_count ?? 0}</td>
              <td>{cat.published_count ?? 0}</td>
              <td style={{ textAlign: 'right' }}>
                {editingId === cat.id ? (
                  <>
                    <button type="button" onClick={() => saveRename(cat.id)} style={btnPrimary}>Save</button>
                    <button type="button" onClick={() => setEditingId(null)} style={btnGhost}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { setEditingId(cat.id); setEditName(cat.name); }} style={btnGhost}>Rename</button>
                    <button type="button" onClick={() => deleteCategory(cat)} style={btnDanger}>Delete</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New category name"
          style={{ padding: '10px 12px', border: '1px solid #ddd', flex: 1, maxWidth: 300 }}
        />
        <button type="button" onClick={addCategory} style={btnPrimary}>Add</button>
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px', background: '#111', color: '#fff', border: 'none',
  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
};
const btnDanger: React.CSSProperties = { ...btnPrimary, background: '#991b1b', marginLeft: 8 };
const btnGhost: React.CSSProperties = {
  padding: '8px 16px', background: 'transparent', color: '#666', border: '1px solid #ddd',
  fontSize: 11, cursor: 'pointer', marginLeft: 8,
};
