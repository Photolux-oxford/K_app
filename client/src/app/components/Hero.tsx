import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { api } from '../lib/api';

interface HeroSlide {
  slot_number: number;
  image_url: string | null;
  title: string;
  position_x?: number;
  position_y?: number;
  fit_mode?: 'cover' | 'contain';
}

export function Hero() {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<HeroSlide[]>('/portfolio/hero/')
      .then(data => setSlides(data.filter(s => s.image_url)))
      .catch(() => setSlides([]));
  }, []);

  useEffect(() => {
    slideRefs.current.forEach((el, i) => {
      if (!el) return;
      gsap.set(el, { opacity: i === 0 ? 1 : 0, scale: i === 0 ? 1.04 : 1 });
    });

    if (textRef.current) {
      gsap.from(textRef.current, {
        y: 20, opacity: 0, duration: 1.0,
        ease: 'power3.out', delay: 0.4,
      });
    }
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return;
    const interval = setInterval(() => {
      setActiveIdx(prev => {
        const next = (prev + 1) % slides.length;
        const outEl = slideRefs.current[prev];
        const inEl  = slideRefs.current[next];
        if (outEl) gsap.to(outEl, { opacity: 0, scale: 1,    duration: 1.4, ease: 'power2.inOut' });
        if (inEl)  gsap.to(inEl,  { opacity: 1, scale: 1.04, duration: 1.4, ease: 'power2.inOut' });
        return next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [slides.length]);

  const goTo = (idx: number) => {
    if (idx === activeIdx || slides.length < 2) return;
    const outEl = slideRefs.current[activeIdx];
    const inEl  = slideRefs.current[idx];
    if (outEl) gsap.to(outEl, { opacity: 0, scale: 1,    duration: 1.0, ease: 'power2.inOut' });
    if (inEl)  gsap.to(inEl,  { opacity: 1, scale: 1.04, duration: 1.0, ease: 'power2.inOut' });
    setActiveIdx(idx);
  };

  return (
    <section style={{
      position: 'relative',
      /* Slightly taller than the viewport so a short scroll can reveal hands */
      height: 'calc(100vh + 2cm)',
      minHeight: 600,
      overflow: 'hidden',
      background: '#1a1a1a',
    }}>
      {slides.length > 0 ? slides.map((slide, i) => (
        <div
          key={slide.slot_number}
          ref={el => { slideRefs.current[i] = el; }}
          style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0 }}
        >
          <img
            src={slide.image_url!}
            alt={slide.title || 'Photography'}
            style={{
              width: '100%', height: '100%', display: 'block',
              objectFit: slide.fit_mode ?? 'cover',
              objectPosition: `${slide.position_x ?? 50}% ${slide.position_y ?? 50}%`,
            }}
          />
        </div>
      )) : (
        <div ref={el => { slideRefs.current[0] = el; }} style={{ position: 'absolute', inset: 0, background: '#2a2a2a', zIndex: 0 }} />
      )}

      {/* Subtle bottom-edge gradient across full tall hero */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.12) 60%, rgba(0,0,0,0.5) 100%)',
        zIndex: 1,
        pointerEvents: 'none',
      }} />

      {/* Brand / dots / CTAs stay in the first screenful */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: '100vh', zIndex: 2, pointerEvents: 'none',
      }}>
        {/* Top-left: branding */}
        <div
          ref={textRef}
          className="hero-oxford"
          style={{
            position: 'absolute', top: 32, left: 40,
            fontFamily: "'Helvetica Neue', Arial, sans-serif",
            color: '#fff',
          }}
        >
          <p style={{
            fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase',
            fontWeight: 400, margin: 0, opacity: 0.85,
          }}>
            Oxford · Photography
          </p>
        </div>

        {/* Bottom-left: photographer name + slide dots */}
        <div
          className="hero-name"
          style={{
            position: 'absolute', bottom: 32, left: 40,
            fontFamily: "'Helvetica Neue', Arial, sans-serif",
            color: '#fff',
            pointerEvents: 'auto',
          }}
        >
          <h1 style={{
            fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 300,
            letterSpacing: '-0.01em', lineHeight: 1.1,
            margin: '0 0 12px 0',
          }}>
            Photolux Oxford
          </h1>
          {slides.length > 1 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  style={{
                    width: i === activeIdx ? 20 : 7, height: 7,
                    borderRadius: 4,
                    background: i === activeIdx ? '#fff' : 'rgba(255,255,255,0.4)',
                    border: 'none', padding: 0, cursor: 'pointer',
                    transition: 'width 0.3s, background 0.3s',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Bottom-right: action buttons */}
        <div
          className="hero-ctas"
          style={{
            position: 'absolute', bottom: 32, right: 40,
            display: 'flex', gap: 12, alignItems: 'flex-end',
            fontFamily: "'Helvetica Neue', Arial, sans-serif",
            pointerEvents: 'auto',
          }}
        >
          <Link to="/book" style={{
            padding: '10px 22px', background: 'rgba(255,255,255,0.95)', color: '#111',
            fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
            textTransform: 'uppercase', textDecoration: 'none',
          }}>
            Request a Session
          </Link>
          <Link to="/editing" style={{
            padding: '10px 22px',
            border: '1px solid rgba(255,255,255,0.7)', color: '#fff',
            fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
            textTransform: 'uppercase', textDecoration: 'none',
          }}>
            Editing
          </Link>
        </div>
      </div>
    </section>
  );
}
