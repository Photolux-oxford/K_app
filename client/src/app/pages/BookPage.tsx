import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Header } from '../components/Header';
import { api } from '../lib/api';

interface SessionDetails {
  session_type: string;
  phone: string;
  notes: string;
  preferred_schedule: string;
}

const SESSION_TYPES = ['Wedding', 'Portrait', 'Event', 'Landscape', 'Product'];
const FONT = "'Helvetica Neue', Arial, sans-serif";

export function BookPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [details, setDetails] = useState<SessionDetails>({
    session_type: '',
    phone: '',
    notes: '',
    preferred_schedule: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post('/bookings/', {
        session_type: details.session_type.toLowerCase(),
        phone: details.phone,
        notes: details.notes,
        preferred_schedule: details.preferred_schedule,
      });
      toast.success('Quote request submitted! Photolux Oxford will review within 48 hours.');
      navigate('/dashboard');
    } catch {
      toast.error('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#fafafa',
      fontFamily: FONT,
      paddingTop: 80,
    }}>
      <Header />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#aaa', margin: '0 0 8px' }}>
            Request a Quote
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 300, color: '#111', margin: 0, letterSpacing: '-0.01em' }}>
            {step === 1 ? 'Session details' : 'Confirm your request'}
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 36 }}>
          {[1, 2].map(s => (
            <div key={s} style={{
              flex: 1, height: 2, borderRadius: 2,
              background: s <= step ? '#111' : '#e5e7eb',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {step === 1 && (
          <StepDetails
            details={details}
            onChange={setDetails}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepConfirm
            details={details}
            submitting={submitting}
            onBack={() => setStep(1)}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}

function StepDetails({
  details,
  onChange,
  onNext,
}: {
  details: SessionDetails;
  onChange: (d: SessionDetails) => void;
  onNext: () => void;
}) {
  const phoneOk = /^[\d\s+().-]{7,30}$/.test(details.phone.trim());
  const canProceed = !!details.session_type && phoneOk;

  const inputStyle = {
    width: '100%', padding: '10px 12px',
    border: '1px solid rgba(0,0,0,0.12)',
    fontFamily: FONT,
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
      <p style={{ fontSize: 12, color: '#666', lineHeight: 1.6, margin: '0 0 24px' }}>
        Sessions take place at the Photolux Oxford studio. Share your details and what you want
        from the shoot — we will confirm timing via Messages, then send a personalised quote.
      </p>

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
        </div>

        <div>
          <label style={labelStyle}>Preferred date & time (optional)</label>
          <textarea
            value={details.preferred_schedule}
            onChange={e => onChange({ ...details, preferred_schedule: e.target.value })}
            placeholder="e.g. weekday mornings in mid-May, or Saturday 12 April afternoon…"
            maxLength={1000}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
          <p style={{ fontSize: 11, color: '#aaa', margin: '5px 0 0' }}>
            Tell us what works for you — the final date is agreed together in Messages.
          </p>
        </div>

        <div>
          <label style={labelStyle}>What would you like from the photoshoot? (optional)</label>
          <textarea
            value={details.notes}
            onChange={e => onChange({ ...details, notes: e.target.value })}
            placeholder="Style, mood, number of people, outfits, special moments…"
            maxLength={1000}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!canProceed}
        style={{
          width: '100%', padding: '12px 0', marginTop: 24,
          background: canProceed ? '#111' : '#e5e7eb',
          color: canProceed ? '#fff' : '#aaa',
          border: 'none', cursor: canProceed ? 'pointer' : 'not-allowed',
          fontFamily: FONT,
          fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}
      >
        Next →
      </button>
    </div>
  );
}

function StepConfirm({
  details,
  submitting,
  onBack,
  onSubmit,
}: {
  details: SessionDetails;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const row = (label: string, value: string) => (
    <div className="book-confirm-row" style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
      <span className="book-confirm-label" style={{ width: 140, flexShrink: 0, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#aaa' }}>{label}</span>
      <span style={{ fontSize: 13, color: '#111', lineHeight: 1.5, wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  );

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '28px 28px 24px' }}>
      {row('Session', details.session_type)}
      {row('Location', 'Photolux Oxford studio')}
      {row('Preferred timing', details.preferred_schedule)}
      {row('Phone', details.phone)}
      {row('Shoot notes', details.notes)}

      <p style={{ fontSize: 12, color: '#666', lineHeight: 1.6, margin: '20px 0 0' }}>
        Photolux Oxford will review within 48 hours, confirm timing via Messages, then send a quote to pay from your Bookings page.
      </p>

      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        <button onClick={onBack} style={{
          flex: 1, padding: '10px 0', background: '#fff', color: '#111',
          border: '1px solid #ccc', cursor: 'pointer',
          fontFamily: FONT,
          fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>← Back</button>
        <button onClick={onSubmit} disabled={submitting} style={{
          flex: 2, padding: '10px 0',
          background: submitting ? '#ccc' : '#111',
          color: '#fff',
          border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
          fontFamily: FONT,
          fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          {submitting ? 'Submitting…' : 'Submit quote request'}
        </button>
      </div>
    </div>
  );
}
