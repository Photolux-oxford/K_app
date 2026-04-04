import { Link, useNavigate } from 'react-router-dom';

type AdminTab = 'dashboard' | 'bookings' | 'availability' | 'editing' | 'service-area';

const TABS: { label: string; tab: AdminTab; path: string }[] = [
  { label: 'Dashboard',    tab: 'dashboard',    path: '/admin' },
  { label: 'Bookings',     tab: 'bookings',     path: '/admin/bookings' },
  { label: 'Availability', tab: 'availability', path: '/admin/availability' },
  { label: 'Editing',      tab: 'editing',      path: '/admin/editing' },
  { label: 'Service Area', tab: 'service-area', path: '/admin/service-area' },
];

interface AdminLayoutProps {
  activeTab: AdminTab;
  children: React.ReactNode;
}

export function AdminLayout({ activeTab, children }: AdminLayoutProps) {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      {/* Top bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 1000,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          padding: '0 32px',
          height: 64,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Left: admin badge + back link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.15em',
              textTransform: 'uppercase', color: '#bbb',
            }}>
              Admin
            </span>
            <span style={{ width: 1, height: 14, background: '#e0e0e0', display: 'inline-block' }} />
            <button
              onClick={() => navigate('/')}
              style={{
                background: 'none', border: 'none', padding: 0,
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: '#aaa', cursor: 'pointer', transition: 'color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#111')}
              onMouseLeave={e => (e.currentTarget.style.color = '#aaa')}
            >
              ← Back to site
            </button>
          </div>

          {/* Right: tab nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            {TABS.map(({ label, tab, path }) => {
              const isActive = activeTab === tab;
              return (
                <Link
                  key={tab}
                  to={path}
                  style={{
                    fontFamily: "'Helvetica Neue', Arial, sans-serif",
                    fontSize: 12, fontWeight: isActive ? 500 : 400,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: isActive ? '#111' : '#888',
                    textDecoration: 'none',
                    paddingBottom: 3,
                    borderBottom: isActive ? '1px solid #111' : '1px solid transparent',
                    transition: 'color 0.2s, border-color 0.2s',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = '#111'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = '#888'; }}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main style={{
        maxWidth: 1100, margin: '0 auto',
        padding: '40px 32px',
      }}>
        {children}
      </main>
    </div>
  );
}
