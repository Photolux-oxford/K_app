import { Header } from '../components/Header';
import { ServiceAreaMap } from '../components/ServiceAreaMap';
import { Link } from 'react-router-dom';

export function ServiceAreaPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#fff', paddingTop: 80 }}>
      <Header />
      <div className="service-area-page" style={{ maxWidth: 800, margin: '0 auto', padding: '64px 32px' }}>

        <p style={{ fontSize: 10, letterSpacing: 5, textTransform: 'uppercase', color: '#999', marginBottom: 8 }}>
          Studio
        </p>
        <h1 style={{ fontSize: 36, fontWeight: 300, letterSpacing: '-0.5px', marginBottom: 8 }}>
          Studio location
        </h1>
        <div style={{ width: 40, height: 1, background: '#111', marginBottom: 20 }} />
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.8, marginBottom: 16, maxWidth: 560 }}>
          The Photolux studio is located two streets away from Oxford railway station.
          Exact studio details are shared when you request a quote — we keep the
          precise address off the public map for privacy.
        </p>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.8, marginBottom: 40, maxWidth: 560 }}>
          The pin below marks Oxford railway station as a convenient meeting-point
          reference. Ready to book?{' '}
          <Link to="/book" style={{ color: '#111' }}>Start a booking request</Link>.
        </p>

        <ServiceAreaMap />
      </div>
    </div>
  );
}
