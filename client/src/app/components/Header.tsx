import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotificationContext } from '../context/NotificationContext';
import { PageBackButton } from './PageBackButton';
import gsap from 'gsap';

const NAV_LINKS: { label: string; id?: string; to?: string }[] = [
  { label: 'Portfolio', to: '/portfolio' },
  { label: 'Services',  id: 'services'  },
  { label: 'About',     id: 'about'     },
  { label: 'Contact',   id: 'contact'   },
];

/** Customer app pages that don't have homepage section anchors. */
const APP_PATHS = ['/messages', '/dashboard', '/book', '/editing'];

const FONT = "'Helvetica Neue', Arial, sans-serif";

const desktopNavLinkStyle = (active = false): CSSProperties => ({
  fontFamily: FONT,
  fontSize: 11,
  fontWeight: active ? 600 : 400,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#111',
  textDecoration: 'none',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  transition: 'color 0.2s',
  whiteSpace: 'nowrap',
  flexShrink: 0,
});

const desktopMutedNavStyle = (active = false): CSSProperties => ({
  ...desktopNavLinkStyle(active),
  fontWeight: active ? 500 : 400,
  color: active ? '#111' : '#444',
});

/** Primary CTA chip for My Bookings in the top nav. */
const bookingsCtaStyle = (): CSSProperties => ({
  fontFamily: FONT,
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#fff',
  background: '#111',
  textDecoration: 'none',
  padding: '7px 12px',
  border: 'none',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
  flexShrink: 0,
  whiteSpace: 'nowrap',
});

/** Two-line label so "Request a Session" never stacks as three words. */
const requestSessionLabel = (
  <span
    style={{
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      lineHeight: 1.15,
      textAlign: 'center',
    }}
  >
    <span>Request a</span>
    <span>Session</span>
  </span>
);

function NavHoverLink({
  to,
  children,
  active,
  muted = false,
  className,
  onClick,
}: {
  to: string;
  children: ReactNode;
  active?: boolean;
  muted?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const base = muted ? desktopMutedNavStyle(!!active) : desktopNavLinkStyle(!!active);
  return (
    <Link
      to={to}
      className={className}
      onClick={onClick}
      style={base}
      onMouseEnter={e => { if (muted && !active) e.currentTarget.style.color = '#111'; }}
      onMouseLeave={e => { if (muted && !active) e.currentTarget.style.color = '#444'; }}
    >
      {children}
    </Link>
  );
}

const overlayLinkStyle: CSSProperties = {
  fontSize: 'clamp(22px, 6.5vw, 32px)',
  fontWeight: 300,
  letterSpacing: '-0.01em',
  color: '#111',
  textDecoration: 'none',
  fontFamily: FONT,
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
};

export function Header() {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotificationContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const isHome = location.pathname === '/';
  const isAppPage = APP_PATHS.some(
    p => location.pathname === p || location.pathname.startsWith(`${p}/`)
  );
  /** Logged-in account shell (Home / Request a Session / My Bookings / Messages) on app pages. */
  const showAppNav = !!user && isAppPage;
  /** On marketing pages, show My Bookings + Messages for any logged-in user. */
  const showAccountLinks = !!user && !showAppNav;

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  const handleLogout = () => { logout(); navigate('/'); };

  const closeMenu = () => setMenuOpen(false);

  const handleNavClick = (id: string) => {
    closeMenu();
    if (location.pathname !== '/') {
      navigate('/');
      setTimeout(() => scrollTo(id), 350);
      return;
    }
    setTimeout(() => scrollTo(id), 280);
  };

  // GSAP fade the overlay in/out
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    if (menuOpen) {
      gsap.fromTo(el,
        { opacity: 0, pointerEvents: 'none' },
        { opacity: 1, pointerEvents: 'auto', duration: 0.25 }
      );
      document.body.style.overflow = 'hidden';
    } else {
      gsap.to(el, {
        opacity: 0, pointerEvents: 'none', duration: 0.25,
        onComplete: () => { document.body.style.overflow = ''; },
      });
    }
  }, [menuOpen]);

  // Close overlay when resizing to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768 && menuOpen) {
        setMenuOpen(false);
        document.body.style.overflow = '';
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [menuOpen]);

  const messagesBadge = unreadCount > 0 ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 16, height: 16,
      background: '#111', color: '#fff',
      borderRadius: '50%',
      fontSize: 9, fontWeight: 700,
    }}>
      {unreadCount}
    </span>
  ) : null;

  const brandMark = (
    <span style={{
      fontFamily: FONT,
      fontSize: 13, fontWeight: 500, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: '#111',
    }}>
      Photolux Oxford
    </span>
  );

  return (
    <>
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        zIndex: menuOpen ? 2001 : 1000,
        background: isHome ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.92)',
        backdropFilter: isHome ? 'blur(10px) saturate(1.2)' : 'blur(12px)',
        WebkitBackdropFilter: isHome ? 'blur(10px) saturate(1.2)' : 'blur(12px)',
        borderBottom: isHome ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(0,0,0,0.06)',
        transition: 'background 0.25s ease, border-color 0.25s ease',
      }}>
        <div style={{
          width: '100%',
          margin: '0 auto',
          padding: '0 clamp(16px, 2.5vw, 40px)',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          gap: 'clamp(12px, 1.5vw, 28px)',
          position: 'relative',
        }}>

          {/* Left: back (non-home, menu closed) + desktop logo */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            flexShrink: 0, zIndex: 1,
          }}>
            {!isHome && !menuOpen && <PageBackButton />}
            <Link to="/" className="header-desktop-inline" style={{ textDecoration: 'none', flexShrink: 0 }}>
              <span style={{
                fontFamily: FONT,
                fontSize: 12, fontWeight: 500, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: '#111',
                whiteSpace: 'nowrap',
              }}>
                Photolux Oxford
              </span>
            </Link>
          </div>

          {/* Center brand — mobile only; hidden while menu is open so it doesn't cover Portfolio */}
          {!menuOpen && (
            <Link
              to="/"
              className="header-mobile-only"
              style={{
                textDecoration: 'none',
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 2001,
              }}
            >
              {brandMark}
            </Link>
          )}

          {/* Center nav — desktop only (visibility via responsive.css, not Tailwind `hidden`) */}
          <nav
            className="header-desktop-flex"
            style={{
              flex: 1,
              minWidth: 0,
              gap: 'clamp(10px, 1.2vw, 20px)',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'nowrap',
            }}
          >
            {showAppNav ? (
              <>
                <NavHoverLink to="/" muted>
                  Home
                </NavHoverLink>
                <NavHoverLink to="/book" muted active={location.pathname === '/book'}>
                  {requestSessionLabel}
                </NavHoverLink>
                <Link to="/dashboard" style={bookingsCtaStyle()}>
                  My Bookings
                </Link>
                <NavHoverLink to="/messages" muted active={location.pathname === '/messages'}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    Messages
                    {messagesBadge}
                  </span>
                </NavHoverLink>
              </>
            ) : (
              <>
                {NAV_LINKS.map(({ label, id, to }) => (
                  to ? (
                    <Link
                      key={to}
                      to={to}
                      style={desktopMutedNavStyle(location.pathname === to)}
                      onMouseEnter={e => (e.currentTarget.style.color = '#111')}
                      onMouseLeave={e => {
                        if (location.pathname !== to) e.currentTarget.style.color = '#444';
                      }}
                    >
                      {label}
                    </Link>
                  ) : (
                    <button
                      key={id}
                      onClick={() => {
                        if (location.pathname !== '/') {
                          navigate('/');
                          setTimeout(() => scrollTo(id!), 350);
                        } else {
                          scrollTo(id!);
                        }
                      }}
                      style={desktopMutedNavStyle()}
                      onMouseEnter={e => (e.currentTarget.style.color = '#111')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#444')}
                    >
                      {label}
                    </button>
                  )
                ))}
                <Link
                  to="/service-area"
                  style={desktopMutedNavStyle(location.pathname === '/service-area')}
                  onMouseEnter={e => (e.currentTarget.style.color = '#111')}
                  onMouseLeave={e => {
                    if (location.pathname !== '/service-area') e.currentTarget.style.color = '#444';
                  }}
                >
                  Studio
                </Link>
                <NavHoverLink to="/book" muted active={location.pathname === '/book'}>
                  {requestSessionLabel}
                </NavHoverLink>
                {showAccountLinks && (
                  <>
                    <Link to="/dashboard" style={bookingsCtaStyle()}>
                      My Bookings
                    </Link>
                    <NavHoverLink to="/messages" muted active={location.pathname === '/messages'}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        Messages
                        {messagesBadge}
                      </span>
                    </NavHoverLink>
                  </>
                )}
                {!user && (
                  <NavHoverLink to="/login" muted active={location.pathname === '/login'}>
                    Log In
                  </NavHoverLink>
                )}
              </>
            )}
          </nav>

          {/* Right: desktop CTAs + mobile burger */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1.2vw, 16px)',
            flexShrink: 0, justifyContent: 'flex-end', zIndex: 1,
            marginLeft: 'auto',
          }}>

            <Link to="/editing" className="header-desktop-inline" style={desktopNavLinkStyle()}>
              edit-photos
            </Link>

            {user?.is_staff && (
              <Link to="/admin" className="header-desktop-inline" style={{
                ...desktopNavLinkStyle(),
                fontWeight: 500,
                color: '#888',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#111')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#888')}
              >
                Admin
              </Link>
            )}

            <div className="header-desktop-block" style={{ width: 1, height: 16, background: '#ddd', flexShrink: 0 }} />

            {user ? (
              <button
                onClick={handleLogout}
                className="header-desktop-inline"
                style={{
                  padding: '7px 14px',
                  background: '#111', color: '#fff',
                  border: 'none',
                  fontFamily: FONT,
                  fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                  textTransform: 'uppercase', cursor: 'pointer',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                Log Out
              </button>
            ) : (
              <>
                <Link to="/login" className="header-desktop-inline" style={{
                  padding: '7px 14px',
                  border: '1px solid #111', color: '#111',
                  fontFamily: FONT,
                  fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                  textTransform: 'uppercase', textDecoration: 'none',
                  transition: 'background 0.2s, color 0.2s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  Log In
                </Link>
                <Link to="/register" className="header-desktop-inline" style={{
                  padding: '7px 14px',
                  background: '#111', color: '#fff',
                  fontFamily: FONT,
                  fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                  textTransform: 'uppercase', textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  Register
                </Link>
              </>
            )}

            {/* Burger — mobile only */}
            <button
              type="button"
              onClick={() => setMenuOpen(prev => !prev)}
              className="header-mobile-only header-burger"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              style={{
                background: 'none', border: 'none', padding: '10px 4px',
                cursor: 'pointer',
                position: 'relative', zIndex: 2001,
                width: 32, height: 32,
              }}
            >
              <span
                className="header-burger-line"
                style={{
                  display: 'block', width: 20, height: 1.5, background: '#111',
                  position: 'absolute', left: 6,
                  top: menuOpen ? 15 : 10,
                  transform: menuOpen ? 'rotate(45deg)' : 'none',
                  transition: 'top 0.2s, transform 0.2s',
                }}
              />
              <span
                className="header-burger-line"
                style={{
                  display: 'block', width: 20, height: 1.5, background: '#111',
                  position: 'absolute', left: 6, top: 15,
                  opacity: menuOpen ? 0 : 1,
                  transition: 'opacity 0.15s',
                }}
              />
              <span
                className="header-burger-line"
                style={{
                  display: 'block', width: 20, height: 1.5, background: '#111',
                  position: 'absolute', left: 6,
                  top: menuOpen ? 15 : 20,
                  transform: menuOpen ? 'rotate(-45deg)' : 'none',
                  transition: 'top 0.2s, transform 0.2s',
                }}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Full-screen mobile overlay (hidden on desktop via responsive.css) */}
      <div
        ref={overlayRef}
        className="header-mobile-overlay"
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: '#fff',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '88px 24px 48px',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          opacity: 0, pointerEvents: 'none',
          fontFamily: FONT,
        }}
      >
        <nav style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 18, marginBottom: 32,
        }}>
          {showAppNav ? (
            <>
              <Link to="/" onClick={closeMenu} style={overlayLinkStyle}>
                Home
              </Link>
              <Link
                to="/messages"
                onClick={closeMenu}
                style={{ ...overlayLinkStyle, display: 'flex', alignItems: 'center', gap: 10 }}
              >
                Messages
                {messagesBadge}
              </Link>
            </>
          ) : (
            <>
              {NAV_LINKS.map(({ label, id, to }) => (
                to ? (
                  <Link
                    key={to}
                    to={to}
                    onClick={closeMenu}
                    style={overlayLinkStyle}
                  >
                    {label}
                  </Link>
                ) : (
                  <button
                    key={id}
                    onClick={() => handleNavClick(id!)}
                    style={overlayLinkStyle}
                  >
                    {label}
                  </button>
                )
              ))}
              <Link to="/service-area" onClick={closeMenu} style={overlayLinkStyle}>
                Studio
              </Link>
              {showAccountLinks && (
                <Link
                  to="/messages"
                  onClick={closeMenu}
                  style={{ ...overlayLinkStyle, display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  Messages
                  {messagesBadge}
                </Link>
              )}
            </>
          )}
          <Link to="/editing" onClick={closeMenu} style={overlayLinkStyle}>
            edit-photos
          </Link>
        </nav>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <Link
            to="/book"
            onClick={closeMenu}
            style={{
              padding: '14px 40px',
              background: '#111', color: '#fff',
              border: 'none',
              fontSize: 11, fontWeight: 600, letterSpacing: '0.15em',
              textTransform: 'uppercase', textDecoration: 'none',
            }}
          >
            Request a Session
          </Link>
          {user && (
            <Link
              to="/dashboard"
              onClick={closeMenu}
              style={{
                padding: '12px 40px',
                border: '1px solid #111', color: '#111',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.15em',
                textTransform: 'uppercase', textDecoration: 'none',
              }}
            >
              My Bookings
            </Link>
          )}
          {!user && (
            <>
              <Link
                to="/login"
                onClick={closeMenu}
                style={{
                  padding: '12px 40px',
                  border: '1px solid #111', color: '#111',
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.15em',
                  textTransform: 'uppercase', textDecoration: 'none',
                }}
              >
                Log In
              </Link>
              <Link
                to="/register"
                onClick={closeMenu}
                style={{
                  padding: '10px 0',
                  fontFamily: FONT,
                  fontSize: 11, fontWeight: 500, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: '#888', textDecoration: 'none',
                }}
              >
                Register
              </Link>
            </>
          )}
          {user && (
            <button
              type="button"
              onClick={() => { closeMenu(); handleLogout(); }}
              style={{
                background: 'none', border: 'none', padding: '10px 0',
                fontFamily: FONT,
                fontSize: 11, fontWeight: 500, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: '#888', cursor: 'pointer',
              }}
            >
              Log Out
            </button>
          )}
          {user?.is_staff && (
            <Link
              to="/admin"
              onClick={closeMenu}
              style={{
                padding: '10px 0',
                fontFamily: FONT,
                fontSize: 11, fontWeight: 500, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: '#aaa', textDecoration: 'none',
              }}
            >
              Admin Panel
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
