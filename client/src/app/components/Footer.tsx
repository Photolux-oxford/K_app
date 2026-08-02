export function Footer() {
  return (
    <footer
      id="contact"
      style={{
        background: '#111', color: '#fff',
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
      }}
    >
      {/* Main footer bar */}
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '48px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 24,
      }}>
        <span style={{
          fontSize: 13, fontWeight: 500, letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          Photolux Oxford
        </span>

        <a
          href="mailto:hello@kaytubillla.com"
          style={{
            fontSize: 13, color: 'rgba(255,255,255,0.6)',
            textDecoration: 'none', letterSpacing: '0.02em',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => ((e.target as HTMLAnchorElement).style.color = '#fff')}
          onMouseLeave={e => ((e.target as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.6)')}
        >
          hello@kaytubillla.com
        </a>

        <span style={{
          fontSize: 11, color: 'rgba(255,255,255,0.4)',
          letterSpacing: '0.05em',
        }}>
          © {new Date().getFullYear()} Photolux Oxford
        </span>
      </div>
    </footer>
  );
}
