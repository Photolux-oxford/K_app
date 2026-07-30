import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../lib/api';
import type { ApiError } from '../lib/api';

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
  address_line_1: string;
  address_line_2: string;
  postcode: string;
  phone: string;
  notes: string;
  access_instructions: string;
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
    session_type: '',
    address_line_1: '',
    address_line_2: '',
    postcode: '',
    phone: '',
    notes: '',
    access_instructions: '',
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
        address_line_1: details.address_line_1,
        address_line_2: details.address_line_2,
        postcode:     details.postcode,
        phone:        details.phone,
        notes:        details.notes,
        access_instructions: details.access_instructions,
      });
      toast.success('Quote request submitted! Kay will review within 48 hours.');
      navigate('/dashboard');
    } catch (err) {
      if ((err as ApiError).status === 409) {
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
            Request a Quote
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
  const [loading, setLoading] = useState(true);

  const monthKey = toYYYYMM(year, month);

  useEffect(() => {
    setSelectedDate(null);
    setLoading(true);
    api.get<Slot[]>(`/availability/?month=${monthKey}`)
      .then(data => { setSlots(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [monthKey]);

  // Group by date
  const slotsByDate: Record<string, Slot[]> = {};
  for (const s of slots) {
    if (!slotsByDate[s.date]) slotsByDate[s.date] = [];
    slotsByDate[s.date].push(s);
  }

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
                      This is a potential slot — Kay will confirm availability, then send a quote for payment.
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

// ── Step 2: Session details ──────────────────────────────────────────────────

interface StepTwoProps {
  selectedSlot: SelectedSlot;
  details: SessionDetails;
  onChange: (d: SessionDetails) => void;
  onBack: () => void;
  onNext: () => void;
}

function StepTwo({ selectedSlot, details, onChange, onBack, onNext }: StepTwoProps) {
  const [postcodeStatus, setPostcodeStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [postcodeMsg, setPostcodeMsg] = useState('');
  const [withinZone, setWithinZone] = useState(false);

  const isCompleteUkPostcode = (value: string) =>
    /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(value.trim());

  const checkPostcode = async (postcode: string) => {
    const trimmed = postcode.trim();
    if (!trimmed) return;
    if (!isCompleteUkPostcode(trimmed)) {
      setPostcodeStatus('error');
      setPostcodeMsg('Enter a full UK postcode (e.g. OX2 0AN), then click Check.');
      return;
    }
    setPostcodeStatus('checking');
    try {
      const res = await api.post<{ is_within_zone: boolean }>('/service-area/check/', { postcode: trimmed });
      setWithinZone(res.is_within_zone);
      setPostcodeStatus('ok');
      if (res.is_within_zone) {
        setPostcodeMsg('Within service area — home visit available');
      } else {
        setPostcodeMsg("Outside home-visit zone — session at Kay's studio");
      }
    } catch (err) {
      setPostcodeStatus('error');
      setWithinZone(false);
      const data = (err as ApiError).data as { error?: string } | undefined;
      setPostcodeMsg(data?.error ?? 'Could not verify postcode — please check and try again');
    }
  };

  const phoneOk = /^[\d\s+().-]{7,30}$/.test(details.phone.trim());
  const canProceed =
    !!details.session_type &&
    details.address_line_1.trim().length > 0 &&
    details.postcode.trim().length > 0 &&
    phoneOk &&
    postcodeStatus === 'ok';

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

  const borderColor =
    postcodeStatus === 'ok'
      ? (withinZone ? '#22c55e' : '#d97706')
      : postcodeStatus === 'error'
        ? '#ef4444'
        : 'rgba(0,0,0,0.12)';

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '28px 28px 24px' }}>
      <div style={{ background: '#f9f9f9', border: '1px solid #eee', padding: '10px 14px', marginBottom: 24, fontSize: 12, color: '#555' }}>
        {selectedSlot.dateLabel} · {selectedSlot.blockLabel}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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

        <div>
          <label style={labelStyle}>Phone number</label>
          <input
            type="tel"
            value={details.phone}
            onChange={e => onChange({ ...details, phone: e.target.value })}
            placeholder="07…"
            maxLength={30}
            style={inputStyle}
          />
          <p style={{ fontSize: 11, color: '#aaa', margin: '5px 0 0' }}>
            So Kay can contact you if needed about the session.
          </p>
        </div>

        <div>
          <label style={labelStyle}>Postcode</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={details.postcode}
              onChange={e => {
                onChange({ ...details, postcode: e.target.value });
                setPostcodeStatus('idle');
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  checkPostcode(details.postcode);
                }
              }}
              placeholder="OX1 1NE"
              maxLength={10}
              style={{ ...inputStyle, borderColor, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => checkPostcode(details.postcode)}
              disabled={postcodeStatus === 'checking' || !details.postcode.trim()}
              style={{
                padding: '10px 14px',
                background: postcodeStatus === 'checking' ? '#ccc' : '#111',
                color: '#fff',
                border: 'none',
                cursor: postcodeStatus === 'checking' ? 'not-allowed' : 'pointer',
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              {postcodeStatus === 'checking' ? 'Checking…' : 'Check'}
            </button>
          </div>
          {postcodeStatus === 'ok' && withinZone && (
            <p style={{ fontSize: 11, color: '#22c55e', margin: '5px 0 0' }}>✓ {postcodeMsg}</p>
          )}
          {postcodeStatus === 'ok' && !withinZone && (
            <p style={{ fontSize: 11, color: '#d97706', margin: '5px 0 0' }}>{postcodeMsg}</p>
          )}
          {postcodeStatus === 'error' && (
            <p style={{ fontSize: 11, color: '#ef4444', margin: '5px 0 0' }}>✗ {postcodeMsg}</p>
          )}
          {postcodeStatus === 'idle' && (
            <p style={{ fontSize: 11, color: '#aaa', margin: '5px 0 0' }}>
              Enter the full postcode, then click Check.
            </p>
          )}
        </div>

        <div>
          <label style={labelStyle}>Address line 1</label>
          <input
            type="text"
            value={details.address_line_1}
            onChange={e => onChange({ ...details, address_line_1: e.target.value })}
            placeholder="House number and street"
            maxLength={200}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Address line 2 (optional)</label>
          <input
            type="text"
            value={details.address_line_2}
            onChange={e => onChange({ ...details, address_line_2: e.target.value })}
            placeholder="Flat, building, area…"
            maxLength={200}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Access instructions (optional)</label>
          <textarea
            value={details.access_instructions}
            onChange={e => onChange({ ...details, access_instructions: e.target.value })}
            placeholder="Gates, buzzer, parking, flat number…"
            maxLength={1000}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div>
          <label style={labelStyle}>Session notes (optional)</label>
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
    { label: 'Phone',    value: details.phone },
    { label: 'Address',  value: [details.address_line_1, details.address_line_2].filter(Boolean).join(', ') },
    { label: 'Postcode', value: details.postcode },
    ...(details.access_instructions ? [{ label: 'Access', value: details.access_instructions }] : []),
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
          ⚠ This is a potential slot — Kay will confirm availability, then send a quote for payment.
        </div>
      ) : (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', marginBottom: 20, fontSize: 11, color: '#166534', borderRadius: 3 }}>
          Kay will review your quote request within 48 hours, confirm availability, then send a price to pay from your Bookings page.
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
          {submitting ? 'Submitting…' : 'Submit Quote Request'}
        </button>
      </div>
    </div>
  );
}
