import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const SERVICES = [
  {
    number: '01',
    title: 'Photography Sessions',
    description:
      'Weddings, portraits, events, and products — captured with precision and artistry. Available on location throughout Oxford and the surrounding area.',
    cta: 'Request a session',
    href: '/book',
    dark: false,
  },
  {
    number: '02',
    title: 'Photo Editing',
    description:
      'Submit your own photos for professional post-processing. Colour grading, retouching, and style-matched editing delivered to your brief.',
    cta: 'Submit photos',
    href: '/editing',
    dark: true,
  },
] as const;

export function Services() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from('.service-card', {
        y: 50, opacity: 0, stagger: 0.15, duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 78%',
        },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      id="services"
      ref={sectionRef}
      style={{
        background: '#f5f5f5', padding: '120px 0',
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px' }}>

        {/* Section label */}
        <p style={{
          fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase',
          color: '#888', marginBottom: 56, fontWeight: 500,
        }}>
          Services
        </p>

        {/* Two cards */}
        <div
          className="services-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 2,
          }}
        >
          {SERVICES.map(svc => (
            <div
              key={svc.number}
              className="service-card"
              style={{
                background: svc.dark ? '#111' : '#fff',
                color: svc.dark ? '#fff' : '#111',
                padding: '64px 48px',
                display: 'flex', flexDirection: 'column',
              }}
            >
              {/* Number */}
              <span style={{
                fontSize: 72, fontWeight: 300, lineHeight: 1,
                color: svc.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
                marginBottom: 32, display: 'block',
                letterSpacing: '-0.04em',
              }}>
                {svc.number}
              </span>

              {/* Title */}
              <h3 style={{
                fontSize: 28, fontWeight: 300, letterSpacing: '-0.01em',
                marginBottom: 20, lineHeight: 1.2,
              }}>
                {svc.title}
              </h3>

              {/* Description */}
              <p style={{
                fontSize: 14, lineHeight: 1.8, fontWeight: 400,
                color: svc.dark ? 'rgba(255,255,255,0.65)' : '#666',
                marginBottom: 40, flex: 1,
              }}>
                {svc.description}
              </p>

              {/* Arrow CTA */}
              <Link
                to={svc.href}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.15em',
                  textTransform: 'uppercase', textDecoration: 'none',
                  color: svc.dark ? '#fff' : '#111',
                  borderBottom: `1px solid ${svc.dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'}`,
                  paddingBottom: 4,
                }}
                onMouseEnter={e => {
                  const arrow = e.currentTarget.querySelector('.arrow') as HTMLElement;
                  if (arrow) gsap.to(arrow, { x: 6, duration: 0.25, ease: 'power2.out' });
                }}
                onMouseLeave={e => {
                  const arrow = e.currentTarget.querySelector('.arrow') as HTMLElement;
                  if (arrow) gsap.to(arrow, { x: 0, duration: 0.25, ease: 'power2.in' });
                }}
              >
                {svc.cta}
                <span className="arrow" style={{ fontSize: 14, lineHeight: 1 }}>→</span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
