import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { api } from '../../lib/api';

interface RecentBooking {
  id: number;
  customer_email: string;
  session_type: string;
  status: string;
  created_at: string;
}

interface RecentEditing {
  id: number;
  customer_email: string;
  turnaround: string;
  status: string;
  created_at: string;
}

interface Stats {
  pending_bookings: number;
  active_editing: number;
  portfolio_items: number;
  recent_bookings: RecentBooking[];
  recent_editing: RecentEditing[];
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:     { bg: '#fef3c7', text: '#92400e' },
  confirmed:   { bg: '#d1fae5', text: '#065f46' },
  declined:    { bg: '#fee2e2', text: '#991b1b' },
  completed:   { bg: '#f3f4f6', text: '#374151' },
  cancelled:   { bg: '#f3f4f6', text: '#374151' },
  requested:   { bg: '#fef3c7', text: '#92400e' },
  in_progress: { bg: '#dbeafe', text: '#1e40af' },
  delivered:   { bg: '#d1fae5', text: '#065f46' },
};

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? { bg: '#f3f4f6', text: '#374151' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 8px',
      background: colors.bg,
      color: colors.text,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      borderRadius: 2,
    }}>
      {status.replace('_', ' ')}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get<Stats>('/admin/stats/')
      .then(setStats)
      .catch(() => setError('Failed to load dashboard data.'));
  }, []);

  const STAT_CARDS = stats ? [
    { label: 'Pending Bookings', value: stats.pending_bookings },
    { label: 'Active Editing',   value: stats.active_editing },
    { label: 'Portfolio Items',  value: stats.portfolio_items },
  ] : [];

  return (
    <AdminLayout activeTab="dashboard">
      <div style={{ marginBottom: 40 }}>
        <h1 style={{
          fontSize: 13, fontWeight: 500, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: '#111', margin: 0,
        }}>
          Overview
        </h1>
      </div>

      {error && (
        <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 24 }}>{error}</p>
      )}

      {/* Stat cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 48 }}>
          {STAT_CARDS.map(({ label, value }) => (
            <div key={label} style={{
              background: '#fff',
              border: '1px solid rgba(0,0,0,0.06)',
              padding: '28px 28px 24px',
            }}>
              <div style={{ fontSize: 48, fontWeight: 300, color: '#111', lineHeight: 1, marginBottom: 8 }}>
                {value}
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888' }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent activity */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Recent Bookings */}
          <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '24px 28px' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
            }}>
              <h2 style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: '#888', margin: 0,
              }}>
                Recent Bookings
              </h2>
              <button
                onClick={() => navigate('/admin/bookings')}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: '#aaa', cursor: 'pointer', transition: 'color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#111')}
                onMouseLeave={e => (e.currentTarget.style.color = '#aaa')}
              >
                View all →
              </button>
            </div>

            {stats.recent_bookings.length === 0 ? (
              <p style={{ fontSize: 13, color: '#bbb', margin: 0 }}>No bookings yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {stats.recent_bookings.map((b, i) => (
                    <tr
                      key={b.id}
                      onClick={() => navigate('/admin/bookings')}
                      style={{
                        borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '10px 0', fontSize: 12, color: '#111', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.customer_email}
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: 11, color: '#888', textTransform: 'capitalize' }}>
                        {b.session_type}
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'right' }}>
                        <StatusBadge status={b.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recent Editing */}
          <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '24px 28px' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
            }}>
              <h2 style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: '#888', margin: 0,
              }}>
                Recent Editing
              </h2>
              <button
                onClick={() => navigate('/admin/editing')}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: '#aaa', cursor: 'pointer', transition: 'color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#111')}
                onMouseLeave={e => (e.currentTarget.style.color = '#aaa')}
              >
                View all →
              </button>
            </div>

            {stats.recent_editing.length === 0 ? (
              <p style={{ fontSize: 13, color: '#bbb', margin: 0 }}>No editing requests yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {stats.recent_editing.map((e, i) => (
                    <tr
                      key={e.id}
                      onClick={() => navigate('/admin/editing')}
                      style={{
                        borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '10px 0', fontSize: 12, color: '#111', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.customer_email}
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: 11, color: '#888' }}>
                        {e.turnaround}
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'right' }}>
                        <StatusBadge status={e.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {!stats && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 48 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              background: '#fff', border: '1px solid rgba(0,0,0,0.06)',
              padding: '28px 28px 24px', height: 100,
              backgroundImage: 'linear-gradient(90deg, #f0f0f0 25%, #f8f8f8 50%, #f0f0f0 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
            }} />
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
