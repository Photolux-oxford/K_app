import { useEffect, useRef, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { api } from '../../lib/api';

interface Booking {
  id: number;
  customer_email: string;
  customer_name?: string;
  session_type: string;
  location: string;
  address_line_1?: string;
  address_line_2?: string;
  phone?: string;
  date: string | null;
  status: string;
  notes: string;
  access_instructions?: string;
  is_home_visit?: boolean;
  created_at: string;
}

const STATUS_FILTERS = ['All', 'Pending', 'Confirmed', 'Completed', 'Declined', 'Cancelled'];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:   { bg: '#fef3c7', text: '#92400e' },
  confirmed: { bg: '#d1fae5', text: '#065f46' },
  declined:  { bg: '#fee2e2', text: '#991b1b' },
  completed: { bg: '#f3f4f6', text: '#374151' },
  cancelled: { bg: '#f3f4f6', text: '#374151' },
};

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? { bg: '#f3f4f6', text: '#374151' };
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px',
      background: colors.bg, color: colors.text,
      fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
      textTransform: 'uppercase', borderRadius: 2,
    }}>
      {status}
    </span>
  );
}

interface MessageModalProps {
  booking: Booking;
  onClose: () => void;
}

function MessageModal({ booking, onClose }: MessageModalProps) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleSend = async () => {
    if (!body.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.post(`/admin/bookings/${booking.id}/message/`, { body: body.trim() });
      setSent(true);
      setTimeout(onClose, 1200);
    } catch {
      setError('Failed to send message. Please try again.');
      setSending(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', width: '100%', maxWidth: 480,
          padding: '32px 32px 28px',
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
        }}
      >
        <h2 style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#111', margin: '0 0 4px' }}>
          Send Message
        </h2>
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 20px' }}>
          To: {booking.customer_name || booking.customer_email}
        </p>

        {sent ? (
          <p style={{ fontSize: 13, color: '#065f46', textAlign: 'center', padding: '24px 0' }}>
            Message sent.
          </p>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              placeholder="Write your message..."
              style={{
                width: '100%', resize: 'vertical',
                border: '1px solid rgba(0,0,0,0.12)', padding: '10px 12px',
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontSize: 13, color: '#111', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {error && <p style={{ fontSize: 12, color: '#b91c1c', margin: '8px 0 0' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 12, marginTop: 16, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button
                onClick={onClose}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: '#aaa', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !body.trim()}
                style={{
                  padding: '8px 20px', background: sending || !body.trim() ? '#ccc' : '#111',
                  color: '#fff', border: 'none',
                  fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  fontSize: 11, fontWeight: 500, letterSpacing: '0.1em',
                  textTransform: 'uppercase', cursor: sending || !body.trim() ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AdminBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeFilter, setActiveFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [messageTarget, setMessageTarget] = useState<Booking | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchBookings = (filter: string) => {
    setLoading(true);
    const param = filter === 'All' ? '' : `?status=${filter.toLowerCase()}`;
    api.get<Booking[]>(`/admin/bookings/${param}`)
      .then(data => { setBookings(data); setLoading(false); })
      .catch(() => { setError('Failed to load bookings.'); setLoading(false); });
  };

  useEffect(() => { fetchBookings(activeFilter); }, [activeFilter]);

  const handleStatus = async (booking: Booking, status: string) => {
    setUpdatingId(booking.id);
    try {
      const updated = await api.patch<{ id: number; status: string }>(
        `/admin/bookings/${booking.id}/status/`, { status }
      );
      setBookings(prev => prev.map(b => b.id === updated.id ? { ...b, status: updated.status } : b));
    } catch {
      alert('Failed to update status.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <AdminLayout activeTab="bookings">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 13, fontWeight: 500, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: '#111', margin: '0 0 20px',
        }}>
          Bookings
        </h1>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              style={{
                background: 'none', border: 'none',
                padding: '8px 16px 10px',
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontSize: 11, fontWeight: activeFilter === f ? 500 : 400,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: activeFilter === f ? '#111' : '#888',
                cursor: 'pointer',
                borderBottom: activeFilter === f ? '2px solid #111' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color 0.2s',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 16 }}>{error}</p>}

      {loading ? (
        <p style={{ fontSize: 13, color: '#bbb' }}>Loading…</p>
      ) : bookings.length === 0 ? (
        <p style={{ fontSize: 13, color: '#bbb' }}>No bookings found.</p>
      ) : (
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                {['Customer', 'Session', 'Location', 'Date', 'Status', 'Actions'].map(col => (
                  <th key={col} style={{
                    padding: '12px 16px', textAlign: 'left',
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: '#aaa',
                    fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.map((b, i) => (
                <tr
                  key={b.id}
                  style={{
                    borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                    opacity: updatingId === b.id ? 0.5 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  <td style={{ padding: '14px 16px', fontSize: 12, color: '#111' }}>
                    {b.customer_name || b.customer_email}
                    {b.customer_name && (
                      <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{b.customer_email}</div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 12, color: '#555', textTransform: 'capitalize' }}>
                    {b.session_type}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 12, color: '#555', maxWidth: 180 }}>
                    <div title={b.location}>
                      {(b.address_line_1 || b.location).length > 40
                        ? (b.address_line_1 || b.location).slice(0, 40) + '…'
                        : (b.address_line_1 || b.location)}
                    </div>
                    {b.address_line_2 && (
                      <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{b.address_line_2}</div>
                    )}
                    {b.phone && (
                      <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>{b.phone}</div>
                    )}
                    {b.is_home_visit === false && (
                      <div style={{ fontSize: 10, color: '#d97706', marginTop: 2 }}>Studio visit</div>
                    )}
                    {b.access_instructions && (
                      <div style={{ fontSize: 10, color: '#888', marginTop: 2 }} title={b.access_instructions}>
                        Access: {b.access_instructions.length > 40 ? b.access_instructions.slice(0, 40) + '…' : b.access_instructions}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 12, color: '#555' }}>
                    {b.date
                      ? new Date(b.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <StatusBadge status={b.status} />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {b.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleStatus(b, 'confirmed')}
                            disabled={updatingId === b.id}
                            style={{
                              padding: '5px 12px', background: '#111', color: '#fff',
                              border: 'none', fontSize: 10, fontWeight: 600,
                              letterSpacing: '0.08em', textTransform: 'uppercase',
                              cursor: 'pointer', fontFamily: "'Helvetica Neue', Arial, sans-serif",
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => handleStatus(b, 'declined')}
                            disabled={updatingId === b.id}
                            style={{
                              padding: '4px 12px', background: 'none',
                              border: '1px solid #111', color: '#111',
                              fontSize: 10, fontWeight: 600,
                              letterSpacing: '0.08em', textTransform: 'uppercase',
                              cursor: 'pointer', fontFamily: "'Helvetica Neue', Arial, sans-serif",
                            }}
                          >
                            Decline
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setMessageTarget(b)}
                        style={{
                          background: 'none', border: 'none', padding: '4px 0',
                          fontFamily: "'Helvetica Neue', Arial, sans-serif",
                          fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: '#888', cursor: 'pointer', transition: 'color 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#111')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#888')}
                      >
                        Message
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {messageTarget && (
        <MessageModal booking={messageTarget} onClose={() => setMessageTarget(null)} />
      )}
    </AdminLayout>
  );
}
