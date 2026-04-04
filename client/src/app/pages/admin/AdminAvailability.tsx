import { useEffect, useRef, useState } from 'react';
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

const STATUS_CYCLE: Record<string, string> = {
  unset:       'available',
  available:   'potential',
  potential:   'unavailable',
  unavailable: 'unset',
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

export function AdminAvailability() {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const fetchGenRef = useRef(0);

  const monthKey = toYYYYMM(year, month);

  useEffect(() => {
    setSelectedDate(null);
    setPendingChanges({});
    setLoading(true);
    const gen = ++fetchGenRef.current;
    api.get<Slot[]>(`/admin/availability/?month=${monthKey}`)
      .then(data => {
        if (fetchGenRef.current === gen) {
          setSlots(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (fetchGenRef.current === gen) {
          setError('Failed to load availability.');
          setLoading(false);
        }
      });
  }, [monthKey]);

  const slotsByDate: Record<string, Slot[]> = {};
  for (const s of slots) {
    if (!slotsByDate[s.date]) slotsByDate[s.date] = [];
    slotsByDate[s.date].push(s);
  }

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
    if (current === 'booked') return;
    const next = STATUS_CYCLE[current] ?? 'unset';
    setPendingChanges(prev => ({ ...prev, [`${date}__${block}`]: next }));
  }

  async function saveDay(date: string) {
    setSaving(true);
    setError('');
    const gen = fetchGenRef.current;

    // Snapshot for revert on error
    const slotSnapshot = slots;
    const pendingSnapshot = { ...pendingChanges };

    // Optimistically apply changes to local slots state
    const dayChanges = BLOCKS.reduce((acc, block) => {
      const key = `${date}__${block}`;
      if (key in pendingChanges) acc[block] = pendingChanges[key];
      return acc;
    }, {} as Record<string, string>);

    setSlots(prev => {
      const withoutDay = prev.filter(s => s.date !== date);
      const existingDay = prev.filter(s => s.date === date);
      const updated: Slot[] = [];
      for (const block of BLOCKS) {
        const newStatus = dayChanges[block];
        if (!newStatus || newStatus === 'unset') continue; // will be deleted
        const existing = existingDay.find(s => s.block === block);
        if (existing) {
          updated.push({ ...existing, status: newStatus as Slot['status'] });
        } else {
          // Create a temporary optimistic slot (id=0, times filled from block)
          const TIMES: Record<string, { start: string; end: string }> = {
            morning:   { start: '08:00', end: '11:00' },
            afternoon: { start: '12:00', end: '15:00' },
            evening:   { start: '16:00', end: '20:00' },
          };
          updated.push({
            id: 0,
            date,
            block: block as Slot['block'],
            start_time: TIMES[block].start,
            end_time: TIMES[block].end,
            status: newStatus as Slot['status'],
            is_booked: false,
          });
        }
      }
      return [...withoutDay, ...updated];
    });

    // Clear pending for this date optimistically
    setPendingChanges(prev => {
      const next = { ...prev };
      for (const block of BLOCKS) delete next[`${date}__${block}`];
      return next;
    });

    try {
      const daySlots = slotSnapshot.filter(s => s.date === date);
      const slotById: Record<string, Slot> = {};
      for (const s of daySlots) slotById[s.block] = s;

      await Promise.all(BLOCKS.map(async block => {
        const key = `${date}__${block}`;
        if (!(key in pendingSnapshot)) return;
        const newStatus = pendingSnapshot[key];
        if (newStatus === 'unset') {
          const existing = slotById[block];
          if (existing) {
            await api.delete(`/admin/availability/${existing.id}/`);
          }
        } else {
          await api.post('/admin/availability/upsert/', { date, block, status: newStatus });
        }
      }));

      // Refresh with server-confirmed data
      const updated = await api.get<Slot[]>(`/admin/availability/?month=${monthKey}`);
      if (fetchGenRef.current === gen) setSlots(updated);
    } catch {
      // Revert on error
      setSlots(slotSnapshot);
      setPendingChanges(pendingSnapshot);
      setError('Failed to save changes.');
    } finally {
      setSaving(false);
    }
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

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const hasPendingForDate = (date: string) =>
    BLOCKS.some(b => `${date}__${b}` in pendingChanges);

  return (
    <AdminLayout activeTab="availability">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#111', margin: 0 }}>
          Availability
        </h1>
      </div>

      {error && <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '24px 24px 20px', flex: '1 1 400px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button onClick={prevMonth} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#555', padding: '4px 8px' }}>‹</button>
            <span style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: 13, fontWeight: 500, letterSpacing: '0.06em', color: '#111' }}>
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button onClick={nextMonth} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#555', padding: '4px 8px' }}>›</button>
          </div>

          {loading ? (
            <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '24px 0', margin: 0 }}>Loading…</p>
          ) : (
            <>
              {/* Day-of-week headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
                {DAY_LABELS.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#aaa', padding: '4px 0' }}>{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
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
                        borderRadius: 4, cursor: 'pointer',
                        background: isSelected ? '#fafafa' : '#fff',
                        textAlign: 'center', position: 'relative',
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: isSelected ? 600 : 400, color: '#111', marginBottom: 4 }}>
                        {day}
                        {hasPending && <span style={{ color: '#f59e0b', fontSize: 10, marginLeft: 2 }}>•</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                        {BLOCKS.map(block => {
                          const st = getEffectiveStatus(dateStr, block);
                          return (
                            <span key={block} title={`${BLOCK_LABELS[block]}: ${st}`} style={{ width: 6, height: 6, borderRadius: '50%', background: DOT_COLORS[st] ?? DOT_COLORS.unset, display: 'inline-block' }} />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            {Object.entries(DOT_COLORS).map(([key, color]) => (
              <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#555' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                {STATUS_BADGE[key]?.label ?? key}
              </span>
            ))}
          </div>
        </div>

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
