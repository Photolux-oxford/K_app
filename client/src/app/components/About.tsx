import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const KAY_PHOTO = 'https://images.unsplash.com/photo-1618661148759-0d481c0c2116?w=800&q=80';

export function About() {
  const sectionRef = useRef<HTMLElement>(null);
  const nameRef    = useRef<HTMLHeadingElement>(null);
  const lineRef    = useRef<HTMLDivElement>(null);
  const textRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const ctx = gsap.context(() => {
      // Masked name reveal
      if (nameRef.current) {
        gsap.from(nameRef.current, {
          y: 60, opacity: 0, duration: 1.0,
          ease: 'power3.out',
          scrollTrigger: { trigger: nameRef.current, start: 'top 82%' },
        });
      }
      // Rule line draw
      if (lineRef.current) {
        gsap.from(lineRef.current, {
          scaleX: 0, transformOrigin: 'left center', duration: 1.0,
          ease: 'power3.inOut',
          scrollTrigger: { trigger: lineRef.current, start: 'top 82%' },
        });
      }
      // Text block fade
      if (textRef.current) {
        gsap.from(textRef.current, {
          y: 30, opacity: 0, duration: 0.9,
          ease: 'power3.out', delay: 0.2,
          scrollTrigger: { trigger: textRef.current, start: 'top 82%' },
        });
      }
      // Photo slide in from left
      gsap.from('.about-photo', {
        x: -40, opacity: 0, duration: 1.0,
        ease: 'power3.out',
        scrollTrigger: { trigger: sectionRef.current, start: 'top 78%' },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      id="about"
      ref={sectionRef}
      style={{
        background: '#fff', padding: '120px 0',
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <div
        className="about-grid"
        style={{
          maxWidth: 1200, margin: '0 auto', padding: '0 32px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80,
          alignItems: 'center',
        }}
      >

        {/* Left — photo */}
        <div className="about-photo" style={{ position: 'relative' }}>
          <div
            className="about-photo-wrap"
            style={{
              aspectRatio: '3/4', overflow: 'hidden',
              background: '#f5f5f5',
            }}
          >
            <img
              src={KAY_PHOTO}
              alt="Photolux Oxford — photographer"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        </div>

        {/* Right — text */}
        <div>
          <p style={{
            fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase',
            color: '#888', marginBottom: 24, fontWeight: 500,
          }}>
            About
          </p>

          <h2
            ref={nameRef}
            style={{
              fontSize: 'clamp(36px, 4.5vw, 56px)', fontWeight: 300,
              color: '#111', letterSpacing: '-0.02em', margin: '0 0 24px 0',
              lineHeight: 1.1,
            }}
          >
            Photolux Oxford
          </h2>

          <div
            ref={lineRef}
            style={{ width: '100%', maxWidth: 64, height: 1, background: '#111', marginBottom: 32 }}
          />

          <div ref={textRef}>
            <p style={{
              fontSize: 15, lineHeight: 1.85, color: '#555', marginBottom: 20, fontWeight: 400,
            }}>
              Based in Oxford, Photolux Oxford has spent years developing a quiet, precise approach to photography
              — one that puts subjects at ease and captures genuinely unguarded moments.
            </p>
            <p style={{
              fontSize: 15, lineHeight: 1.85, color: '#555', marginBottom: 32, fontWeight: 400,
            }}>
              From intimate wedding ceremonies at the Bodleian to portrait sessions in Port Meadow,
              every project is approached with the same attention: careful light, honest framing,
              and an edit that serves the story rather than the trend.
            </p>
            <p style={{
              fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: '#888', fontWeight: 500,
            }}>
              Oxford Studio
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
