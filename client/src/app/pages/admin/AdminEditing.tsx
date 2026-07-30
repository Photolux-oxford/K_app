import { useEffect, useRef, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { api } from '../../lib/api';

interface EditingRequest {
  id: number;
  customer_email: string;
  customer_name?: string;
  style_notes: string;
  turnaround: string;
  status: string;
  quoted_price: string | null;
  file_count: number;
  created_at: string;
}

const STATUS_FILTERS = ['All', 'Requested', 'Confirmed', 'In Progress', 'Delivered', 'Declined'];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  requested:   { bg: '#fef3c7', text: '#92400e' },
  confirmed:   { bg: '#d1fae5', text: '#065f46' },
  in_progress: { bg: '#dbeafe', text: '#1e40af' },
  delivered:   { bg: '#f3f4f6', text: '#374151' },
  declined:    { bg: '#fee2e2', text: '#991b1b' },
};

const STATUS_PROGRESSION: Record<string, string[]> = {
  confirmed:   ['confirmed', 'in_progress', 'delivered'],
  in_progress: ['confirmed', 'in_progress', 'delivered'],
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
      {status.replace('_', ' ')}
    </span>
  );
}

interface MessageModalProps {
  editing: EditingRequest;
  onClose: () => void;
}

function MessageModal({ editing, onClose }: MessageModalProps) {
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
      await api.post(`/admin/editing-requests/${editing.id}/message/`, { body: body.trim() });
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
          To: {editing.customer_name || editing.customer_email}
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

export function AdminEditing() {
  const [requests, setRequests] = useState<EditingRequest[]>([]);
  const [activeFilter, setActiveFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [messageTarget, setMessageTarget] = useState<EditingRequest | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchRequests = (filter: string) => {
    setLoading(true);
    const statusParam = filter === 'All' ? '' : `?status=${filter.toLowerCase().replace(' ', '_')}`;
    api.get<EditingRequest[]>(`/admin/editing-requests/${statusParam}`)
      .then(data => { setRequests(data); setLoading(false); })
      .catch(() => { setError('Failed to load editing requests.'); setLoading(false); });
  };

  useEffect(() => { fetchRequests(activeFilter); }, [activeFilter]);

  const patchRequest = async (id: number, payload: Record<string, unknown>) => {
    setUpdatingId(id);
    try {
      const updated = await api.patch<{ id: number; status: string; quoted_price: string | null }>(
        `/admin/editing-requests/${id}/status/`, payload
      );
      setRequests(prev => prev.map(r =>
        r.id === updated.id ? { ...r, status: updated.status, quoted_price: updated.quoted_price } : r
      ));
    } catch {
      alert('Failed to update. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusChange = (r: EditingRequest, newStatus: string) => {
    patchRequest(r.id, { status: newStatus });
  };

  const handlePriceBlur = (r: EditingRequest, value: string) => {
    const trimmed = value.trim();
    const current = r.quoted_price ?? '';
    if (trimmed === current) return;
    patchRequest(r.id, { quoted_price: trimmed === '' ? null : trimmed });
  };

  return (
    <AdminLayout activeTab="editing">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 13, fontWeight: 500, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: '#111', margin: '0 0 20px',
        }}>
          Editing Requests
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
      ) : requests.length === 0 ? (
        <p style={{ fontSize: 13, color: '#bbb' }}>No editing requests found.</p>
      ) : (
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                {['Customer', 'Style Notes', 'Turnaround', 'Files', 'Price (£)', 'Status', 'Actions'].map(col => (
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
              {requests.map((r, i) => {
                const canProgress = r.status in STATUS_PROGRESSION;
                return (
                  <tr
                    key={r.id}
                    style={{
                      borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                      opacity: updatingId === r.id ? 0.5 : 1,
                      transition: 'opacity 0.2s',
                    }}
                  >
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#111' }}>
                      {r.customer_name || r.customer_email}
                      {r.customer_name && (
                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{r.customer_email}</div>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#555', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.style_notes.length > 60 ? r.style_notes.slice(0, 60) + '…' : r.style_notes}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>
                      {r.turnaround}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#888', textAlign: 'center' }}>
                      {r.file_count}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={r.quoted_price ?? ''}
                        placeholder="—"
                        onBlur={e => handlePriceBlur(r, e.target.value)}
                        style={{
                          width: 72,
                          border: 'none', borderBottom: '1px solid rgba(0,0,0,0.15)',
                          padding: '4px 0', background: 'none',
                          fontFamily: "'Helvetica Neue', Arial, sans-serif",
                          fontSize: 12, color: '#111', outline: 'none',
                        }}
                      />
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {canProgress ? (
                        <select
                          value={r.status}
                          onChange={e => handleStatusChange(r, e.target.value)}
                          disabled={updatingId === r.id}
                          style={{
                            border: '1px solid rgba(0,0,0,0.12)',
                            padding: '4px 8px', background: '#fff',
                            fontFamily: "'Helvetica Neue', Arial, sans-serif",
                            fontSize: 11, letterSpacing: '0.05em',
                            color: '#111', cursor: 'pointer', outline: 'none',
                          }}
                        >
                          {STATUS_PROGRESSION[r.status].map(s => (
                            <option key={s} value={s}>{s.replace('_', ' ')}</option>
                          ))}
                        </select>
                      ) : (
                        <StatusBadge status={r.status} />
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {r.status === 'requested' && (
                          <>
                            <button
                              onClick={() => patchRequest(r.id, { status: 'confirmed' })}
                              disabled={updatingId === r.id}
                              style={{
                                padding: '5px 12px', background: '#111', color: '#fff',
                                border: 'none', fontSize: 10, fontWeight: 600,
                                letterSpacing: '0.08em', textTransform: 'uppercase',
                                cursor: 'pointer', fontFamily: "'Helvetica Neue', Arial, sans-serif",
                              }}
                            >
                              Accept job
                            </button>
                            <button
                              onClick={() => patchRequest(r.id, { status: 'declined' })}
                              disabled={updatingId === r.id}
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
                          onClick={() => setMessageTarget(r)}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {messageTarget && (
        <MessageModal editing={messageTarget} onClose={() => setMessageTarget(null)} />
      )}
    </AdminLayout>
  );
}
