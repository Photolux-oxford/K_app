import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { api } from '../lib/api';

interface PaymentInfo {
  id: number;
  status: string;
  amount: string;
  currency: string;
  payment_link_url: string | null;
  paid_at: string | null;
}

interface BookingRow {
  id: number;
  session_type: string;
  location: string;
  address_line_1?: string;
  address_line_2?: string;
  postcode: string;
  phone?: string;
  is_home_visit: boolean;
  date: string | null;
  block: string | null;
  status: string;
  notes?: string;
  access_instructions?: string;
  created_at: string;
  payment: PaymentInfo | null;
}

interface EditingRow {
  id: number;
  style_notes: string;
  turnaround: string;
  status: string;
  quoted_price: string | null;
  created_at: string;
  payment: PaymentInfo | null;
}

interface DashboardData {
  bookings: BookingRow[];
  editing_requests: EditingRow[];
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:     { bg: '#fef3c7', text: '#92400e' },
  confirmed:   { bg: '#d1fae5', text: '#065f46' },
  declined:    { bg: '#fee2e2', text: '#991b1b' },
  cancelled:   { bg: '#f3f4f6', text: '#374151' },
  completed:   { bg: '#f3f4f6', text: '#374151' },
  requested:   { bg: '#fef3c7', text: '#92400e' },
  in_progress: { bg: '#dbeafe', text: '#1e40af' },
  delivered:   { bg: '#d1fae5', text: '#065f46' },
  paid:        { bg: '#d1fae5', text: '#065f46' },
};

function Badge({ label }: { label: string }) {
  const c = STATUS_COLORS[label] ?? { bg: '#f3f4f6', text: '#374151' };
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', background: c.bg, color: c.text,
      fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
    }}>{label}</span>
  );
}

function PaymentCell({ payment }: { payment: PaymentInfo | null }) {
  if (!payment) return <span style={{ color: '#bbb', fontSize: 13 }}>—</span>;
  if (payment.status === 'paid') return <Badge label="paid" />;
  if (payment.payment_link_url) {
    return (
      <a href={payment.payment_link_url} target="_blank" rel="noreferrer" style={{
        display: 'inline-block',
        padding: '6px 14px',
        border: '2px solid #111',
        fontSize: 12, color: '#111', fontWeight: 600, letterSpacing: '0.05em',
        textDecoration: 'none',
        transition: 'background 0.2s, color 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#111'; e.currentTarget.style.color = '#fff'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#111'; }}
      >
        Pay £{payment.amount}
      </a>
    );
  }
  return <Badge label={payment.status} />;
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    api.get<DashboardData>('/dashboard/')
      .then(setData)
      .catch(() => setError('Could not load your dashboard.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa' }}>
      <Header />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '120px 32px 64px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 300, marginBottom: 8 }}>My account</h1>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 40 }}>
          Your bookings, editing jobs, and payments.{' '}
          <Link to="/messages" style={{ color: '#111' }}>View messages →</Link>
        </p>

        {loading && <p style={{ color: '#888' }}>Loading…</p>}
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

        {data && (
          <>
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
                Bookings
              </h2>
              {data.bookings.length === 0 ? (
                <p style={{ color: '#888', fontSize: 14 }}>No bookings yet. <Link to="/book">Request a session</Link></p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data.bookings.map(b => (
                    <div key={b.id} style={{
                      background: '#fff', border: '1px solid #eee', padding: 20,
                      display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <strong style={{ textTransform: 'capitalize' }}>{b.session_type}</strong>
                          <Badge label={b.status} />
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                          {[b.address_line_1 || b.location, b.address_line_2].filter(Boolean).join(', ')} · {b.postcode}
                          {b.date && ` · ${b.date} (${b.block})`}
                          {b.is_home_visit ? ' · Home visit' : ' · Studio'}
                        </p>
                        {b.phone && (
                          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#555' }}>
                            Phone: {b.phone}
                          </p>
                        )}
                        {b.access_instructions && (
                          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
                            Access: {b.access_instructions}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        <PaymentCell payment={b.payment} />
                        <Link to={`/messages?thread=booking_${b.id}`} style={{ fontSize: 12, color: '#888' }}>Messages</Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
                Editing requests
              </h2>
              {data.editing_requests.length === 0 ? (
                <p style={{ color: '#888', fontSize: 14 }}>No editing jobs yet. <Link to="/editing">Submit photos</Link></p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data.editing_requests.map(e => (
                    <div key={e.id} style={{
                      background: '#fff', border: '1px solid #eee', padding: 20,
                      display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <strong>Editing #{e.id}</strong>
                          <Badge label={e.status} />
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: '#666' }}>{e.style_notes}</p>
                        {e.quoted_price && <p style={{ margin: '4px 0 0', fontSize: 13 }}>Quote: £{e.quoted_price}</p>}
                      </div>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        <PaymentCell payment={e.payment} />
                        <Link to={`/messages?thread=editing_${e.id}`} style={{ fontSize: 12, color: '#888' }}>Messages</Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
