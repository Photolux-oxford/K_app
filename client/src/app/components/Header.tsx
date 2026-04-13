import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotificationContext } from '../context/NotificationContext';
import gsap from 'gsap';

const NAV_LINKS = [
  { label: 'Portfolio', id: 'portfolio' },
  { label: 'Services',  id: 'services'  },
  { label: 'About',     id: 'about'     },
  { label: 'Contact',   id: 'contact'   },
];

export function Header() {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotificationContext();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  const handleLogout = () => { logout(); navigate('/'); };

  const closeMenu = () => setMenuOpen(false);

  const handleNavClick = (id: string) => {
    closeMenu();
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

  return (
    <>
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        zIndex: 1000,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          padding: '0 20px',
          height: 64,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>

          {/* Left cluster: mobile hamburger + desktop logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Hamburger — mobile only (left side) */}
            <button
              onClick={() => setMenuOpen(true)}
              className="md:hidden"
              aria-label="Open menu"
              style={{
                background: 'none', border: 'none', padding: '6px 4px',
                cursor: 'pointer', display: 'flex', flexDirection: 'column',
                gap: 5, justifyContent: 'center',
              }}
            >
              <span style={{ display: 'block', width: 20, height: 1.5, background: '#111' }} />
              <span style={{ display: 'block', width: 20, height: 1.5, background: '#111' }} />
              <span style={{ display: 'block', width: 20, height: 1.5, background: '#111' }} />
            </button>

            {/* Logo (desktop) */}
            <Link to="/" className="hidden md:inline" style={{ textDecoration: 'none' }}>
              <span style={{
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontSize: 13, fontWeight: 500, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: '#111',
              }}>
                Kay Tubillla
              </span>
            </Link>
          </div>

          {/* Logo (mobile centered) */}
          <Link to="/" className="md:hidden" style={{ textDecoration: 'none' }}>
            <span style={{
              fontFamily: "'Helvetica Neue', Arial, sans-serif",
              fontSize: 13, fontWeight: 500, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#111',
            }}>
              Kay Tubillla
            </span>
          </Link>

          {/* Scroll nav — desktop only */}
          <nav style={{ display: 'flex', gap: 32 }} className="hidden md:flex">
            {NAV_LINKS.map(({ label, id }) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  fontSize: 12, fontWeight: 400, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: '#444',
                  cursor: 'pointer', transition: 'color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#111')}
                onMouseLeave={e => (e.currentTarget.style.color = '#444')}
              >
                {label}
              </button>
            ))}
            <Link
              to="/service-area"
              style={{
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontSize: 12, fontWeight: 400, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: '#444',
                textDecoration: 'none', transition: 'color 0.2s',
              }}
            >
              Area
            </Link>
          </nav>

          {/* Right side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>

            {/* Book + Editing — desktop only */}
            <Link to="/book" className="hidden md:inline" style={{
              fontFamily: "'Helvetica Neue', Arial, sans-serif",
              fontSize: 12, fontWeight: 500, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#111', textDecoration: 'none',
            }}>
              Book
            </Link>
            <Link to="/editing" className="hidden md:inline" style={{
              fontFamily: "'Helvetica Neue', Arial, sans-serif",
              fontSize: 12, fontWeight: 500, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#111', textDecoration: 'none',
            }}>
              Editing
            </Link>
            {user && (
              <Link
                to="/messages"
                className="hidden md:inline"
                style={{
                  fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  fontSize: 12, fontWeight: 500, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: '#111', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                Messages
                {unreadCount > 0 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 16, height: 16,
                    background: '#111', color: '#fff',
                    borderRadius: '50%',
                    fontSize: 9, fontWeight: 700,
                  }}>
                    {unreadCount}
                  </span>
                )}
              </Link>
            )}

            {/* Admin link — desktop only, staff only */}
            {user?.is_staff && (
              <Link to="/admin" className="hidden md:inline" style={{
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontSize: 12, fontWeight: 500, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: '#888', textDecoration: 'none',
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#111')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#888')}
              >
                Admin
              </Link>
            )}

            <div className="hidden md:block" style={{ width: 1, height: 16, background: '#ddd' }} />

            {/* Auth — desktop only (also shown inside overlay on mobile) */}
            {user ? (
              <button
                onClick={handleLogout}
                className="hidden md:inline"
                style={{
                  padding: '8px 18px',
                  background: '#111', color: '#fff',
                  border: 'none',
                  fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  fontSize: 11, fontWeight: 500, letterSpacing: '0.1em',
                  textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                Log Out
              </button>
            ) : (
              <>
                <Link to="/login" className="hidden md:inline" style={{
                  padding: '7px 16px',
                  border: '1px solid #111', color: '#111',
                  fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  fontSize: 11, fontWeight: 500, letterSpacing: '0.1em',
                  textTransform: 'uppercase', textDecoration: 'none',
                  transition: 'background 0.2s, color 0.2s',
                }}>
                  Log In
                </Link>
                <Link to="/register" className="hidden md:inline" style={{
                  padding: '8px 18px',
                  background: '#111', color: '#fff',
                  fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  fontSize: 11, fontWeight: 500, letterSpacing: '0.1em',
                  textTransform: 'uppercase', textDecoration: 'none',
                }}>
                  Register
                </Link>
              </>
            )}

            {/* Spacer to keep centered logo visually centered on mobile */}
            <div className="md:hidden" style={{ width: 28 }} />
          </div>
        </div>
      </header>

      {/* Full-screen mobile overlay — sibling of <header>, NOT a child */}
      <div
        ref={overlayRef}
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: '#fff',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          opacity: 0, pointerEvents: 'none',
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
        }}
      >
        {/* Close button */}
        <button
          onClick={closeMenu}
          aria-label="Close menu"
          style={{
            position: 'absolute', top: 20, right: 24,
            background: 'none', border: 'none',
            fontSize: 32, color: '#111', cursor: 'pointer',
            lineHeight: 1, padding: 4,
          }}
        >
          ×
        </button>

        {/* Nav links */}
        <nav style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 24, marginBottom: 48,
        }}>
          {NAV_LINKS.map(({ label, id }) => (
            <button
              key={id}
              onClick={() => handleNavClick(id)}
              style={{
                background: 'none', border: 'none', padding: 0,
                fontSize: 'clamp(28px, 8vw, 40px)', fontWeight: 300,
                letterSpacing: '-0.01em', color: '#111',
                cursor: 'pointer',
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
              }}
            >
              {label}
            </button>
          ))}
          <Link
            to="/service-area"
            onClick={closeMenu}
            style={{
              fontSize: 'clamp(28px, 8vw, 40px)', fontWeight: 300,
              letterSpacing: '-0.01em', color: '#111',
              textDecoration: 'none',
              fontFamily: "'Helvetica Neue', Arial, sans-serif",
            }}
          >
            Area
          </Link>
        </nav>

        {/* CTA buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <Link
            to="/book"
            onClick={closeMenu}
            style={{
              padding: '14px 40px', background: '#111', color: '#fff',
              fontSize: 11, fontWeight: 600, letterSpacing: '0.15em',
              textTransform: 'uppercase', textDecoration: 'none',
            }}
          >
            Book a Session
          </Link>
          <Link
            to="/editing"
            onClick={closeMenu}
            style={{
              padding: '13px 40px',
              border: '1px solid #111', color: '#111',
              fontSize: 11, fontWeight: 600, letterSpacing: '0.15em',
              textTransform: 'uppercase', textDecoration: 'none',
            }}
          >
            Submit for Editing
          </Link>
          {user && (
            <Link
              to="/messages"
              onClick={closeMenu}
              style={{
                padding: '13px 40px',
                border: '1px solid #111', color: '#111',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.15em',
                textTransform: 'uppercase', textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              Messages
              {unreadCount > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16,
                  background: '#111', color: '#fff',
                  borderRadius: '50%',
                  fontSize: 9, fontWeight: 700,
                }}>
                  {unreadCount}
                </span>
              )}
            </Link>
          )}
          {user?.is_staff && (
            <Link
              to="/admin"
              onClick={closeMenu}
              style={{
                padding: '10px 0',
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontSize: 11, fontWeight: 500, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: '#aaa', textDecoration: 'none',
              }}
            >
              Admin Panel
            </Link>
          )}
        </div>

        {/* Auth links — mobile overlay only */}
        <div style={{
          position: 'absolute', bottom: 40,
          display: 'flex', gap: 16, alignItems: 'center',
        }}>
          {user ? (
            <button
              onClick={() => { closeMenu(); handleLogout(); }}
              style={{
                background: 'none', border: 'none', padding: 0,
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontSize: 11, fontWeight: 500, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: '#888', cursor: 'pointer',
              }}
            >
              Log Out
            </button>
          ) : (
            <>
              <Link to="/login" onClick={closeMenu} style={{
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontSize: 11, fontWeight: 500, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: '#888', textDecoration: 'none',
              }}>
                Log In
              </Link>
              <span style={{ color: '#ddd', fontSize: 11 }}>·</span>
              <Link to="/register" onClick={closeMenu} style={{
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontSize: 11, fontWeight: 500, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: '#888', textDecoration: 'none',
              }}>
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
