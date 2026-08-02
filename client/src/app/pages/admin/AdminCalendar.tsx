import { useEffect, useState, type CSSProperties } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { api } from '../../lib/api';

interface CalendarEvent {
  id: number;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string;
}

const FONT = "'Helvetica Neue', Arial, sans-serif";
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function toYYYYMM(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function emptyForm(date = '') {
  return { title: '', date, start_time: '', end_time: '', notes: '' };
}

export function AdminCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const monthKey = toYYYYMM(year, month);

  const load = () => {
    setLoading(true);
    setError('');
    api.get<CalendarEvent[]>(`/admin/calendar/?month=${monthKey}`)
      .then(data => { setEvents(data); setLoading(false); })
      .catch(() => { setError('Failed to load calendar.'); setLoading(false); });
  };

  useEffect(() => { load(); }, [monthKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const eventsByDate: Record<string, CalendarEvent[]> = {};
  for (const e of events) {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  }

  const firstDayOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDow = (firstDayOfMonth.getDay() + 6) % 7;

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  function openNew(date: string) {
    setSelectedDate(date);
    setEditingId(null);
    setForm(emptyForm(date));
  }

  function openEdit(ev: CalendarEvent) {
    setSelectedDate(ev.date);
    setEditingId(ev.id);
    setForm({
      title: ev.title,
      date: ev.date,
      start_time: ev.start_time ?? '',
      end_time: ev.end_time ?? '',
      notes: ev.notes ?? '',
    });
  }

  async function handleSave() {
    if (!form.title.trim() || !form.date) return;
    setSaving(true);
    setError('');
    const payload = {
      title: form.title.trim(),
      date: form.date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      notes: form.notes.trim(),
    };
    try {
      if (editingId) {
        await api.patch(`/admin/calendar/${editingId}/`, payload);
      } else {
        await api.post('/admin/calendar/', payload);
      }
      setEditingId(null);
      setForm(emptyForm(selectedDate ?? ''));
      load();
    } catch {
      setError('Could not save event.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this calendar entry?')) return;
    try {
      await api.delete(`/admin/calendar/${id}/`);
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm(selectedDate ?? ''));
      }
      load();
    } catch {
      setError('Could not delete event.');
    }
  }

  const dayEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  return (
    <AdminLayout activeTab="calendar">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontSize: 13, fontWeight: 500, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: '#111', margin: '0 0 8px',
        }}>
          Personal calendar
        </h1>
        <p style={{ fontSize: 13, color: '#666', margin: 0, lineHeight: 1.5, maxWidth: 520 }}>
          Private organisation only — not linked to customer bookings. Add shoots, reminders, or blocked days for yourself.
        </p>
      </div>

      {error && <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 360px', background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button onClick={prevMonth} style={navBtn}>←</button>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button onClick={nextMonth} style={navBtn}>→</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
            {DAY_NAMES.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, color: '#aaa', letterSpacing: '0.06em' }}>{d}</div>
            ))}
          </div>

          {loading ? (
            <p style={{ fontSize: 13, color: '#bbb' }}>Loading…</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {Array.from({ length: startDow }).map((_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const count = (eventsByDate[dateStr] ?? []).length;
                const selected = selectedDate === dateStr;
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => openNew(dateStr)}
                    style={{
                      aspectRatio: '1',
                      border: selected ? '1.5px solid #111' : '1px solid #eee',
                      background: count ? '#f5f5f5' : '#fff',
                      cursor: 'pointer',
                      fontFamily: FONT,
                      fontSize: 12,
                      color: '#111',
                      position: 'relative',
                    }}
                  >
                    {day}
                    {count > 0 && (
                      <span style={{
                        position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
                        width: 5, height: 5, borderRadius: '50%', background: '#111',
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selectedDate && (
            <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: 20 }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', margin: '0 0 12px' }}>
                {editingId ? 'Edit entry' : 'New entry'} · {selectedDate}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Title"
                  maxLength={200}
                  style={inputStyle}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={e => setForm({ ...form, start_time: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={e => setForm({ ...form, end_time: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Notes (optional)"
                  rows={3}
                  maxLength={2000}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !form.title.trim()}
                    style={{
                      flex: 1, padding: '10px 0',
                      background: saving || !form.title.trim() ? '#ccc' : '#111',
                      color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                      fontFamily: FONT, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}
                  >
                    {saving ? 'Saving…' : editingId ? 'Update' : 'Add'}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      onClick={() => { setEditingId(null); setForm(emptyForm(selectedDate)); }}
                      style={{
                        padding: '10px 14px', background: '#fff', color: '#111',
                        border: '1px solid #ccc', cursor: 'pointer',
                        fontFamily: FONT, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', margin: '0 0 12px' }}>
              {selectedDate ? `Entries on ${selectedDate}` : 'Select a day'}
            </p>
            {!selectedDate && <p style={{ fontSize: 13, color: '#bbb', margin: 0 }}>Click a day to add or view entries.</p>}
            {selectedDate && dayEvents.length === 0 && (
              <p style={{ fontSize: 13, color: '#bbb', margin: 0 }}>No entries yet.</p>
            )}
            {dayEvents.map(ev => (
              <div key={ev.id} style={{
                padding: '12px 0',
                borderTop: '1px solid #f0f0f0',
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{ev.title}</div>
                {(ev.start_time || ev.end_time) && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    {[ev.start_time, ev.end_time].filter(Boolean).join(' – ')}
                  </div>
                )}
                {ev.notes && <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{ev.notes}</div>}
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button type="button" onClick={() => openEdit(ev)} style={linkBtn}>Edit</button>
                  <button type="button" onClick={() => handleDelete(ev.id)} style={{ ...linkBtn, color: '#b91c1c' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

const navBtn: CSSProperties = {
  background: 'none', border: '1px solid #ddd', padding: '4px 10px',
  cursor: 'pointer', fontFamily: FONT, fontSize: 12, color: '#111',
};

const inputStyle: CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1px solid rgba(0,0,0,0.12)',
  fontFamily: FONT, fontSize: 13, color: '#111', outline: 'none',
  boxSizing: 'border-box',
};

const linkBtn: CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontFamily: FONT, fontSize: 11, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: '#111',
};
