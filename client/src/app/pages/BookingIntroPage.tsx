import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';

const FONT = "'Helvetica Neue', Arial, sans-serif";

const STEPS = [
  {
    n: '01',
    title: 'Choose a date & time',
    body: 'Pick a preferred slot from Kay\'s availability calendar.',
  },
  {
    n: '02',
    title: 'Tell us about the session',
    body: 'Share the session type, location, phone number, and any notes.',
  },
  {
    n: '03',
    title: 'Kay reviews your request',
    body: 'Within 48 hours, Kay confirms availability and prepares a personalised quote.',
  },
  {
    n: '04',
    title: 'Chat if you need to',
    body: 'Use Messages to refine details — location, timing, or creative brief.',
  },
  {
    n: '05',
    title: 'Pay when the quote is ready',
    body: 'Once quoted, you’ll see a Pay button on your Bookings page to complete payment.',
  },
] as const;

export function BookingIntroPage() {
  const { user } = useAuth();
  const ctaTo = user ? '/book/request' : '/login?next=/book/request';

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: FONT }}>
      <Header />
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '120px 24px 80px' }}>
        <p style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.15em',
          textTransform: 'uppercase', color: '#aaa', margin: '0 0 8px',
        }}>
          Photography Sessions
        </p>
        <h1 style={{
          fontSize: 28, fontWeight: 300, color: '#111', margin: '0 0 16px',
          letterSpacing: '-0.01em',
        }}>
          How requesting a session works
        </h1>
        <p style={{
          fontSize: 15, lineHeight: 1.7, color: '#555', margin: '0 0 40px', maxWidth: 520,
        }}>
          This isn’t an instant checkout. You submit a quote request, Kay reviews it,
          and you’ll receive a price tailored to your session — based on type, location,
          and duration.
        </p>

        <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 40px' }}>
          {STEPS.map((step, i) => (
            <li
              key={step.n}
              style={{
                display: 'flex', gap: 20, padding: '20px 0',
                borderTop: i === 0 ? '1px solid rgba(0,0,0,0.08)' : undefined,
                borderBottom: '1px solid rgba(0,0,0,0.08)',
              }}
            >
              <span style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
                color: '#aaa', flexShrink: 0, paddingTop: 2,
              }}>
                {step.n}
              </span>
              <div>
                <h2 style={{
                  fontSize: 15, fontWeight: 500, color: '#111', margin: '0 0 6px',
                }}>
                  {step.title}
                </h2>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: '#666', margin: 0 }}>
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div style={{
          background: '#fff', border: '1px solid rgba(0,0,0,0.06)',
          padding: '16px 20px', marginBottom: 32, fontSize: 13, color: '#555', lineHeight: 1.6,
        }}>
          Pricing is not fixed at this stage. After reviewing your request, Kay sends a quote —
          you only pay once you’ve accepted it on your Bookings page.
        </div>

        <Link
          to={ctaTo}
          style={{
            display: 'inline-block',
            padding: '14px 32px', background: '#111', color: '#fff',
            fontSize: 11, fontWeight: 600, letterSpacing: '0.15em',
            textTransform: 'uppercase', textDecoration: 'none',
          }}
        >
          Request a quote
        </Link>
      </main>
    </div>
  );
}
