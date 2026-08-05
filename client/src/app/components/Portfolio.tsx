import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { api } from '../lib/api';

gsap.registerPlugin(ScrollTrigger);

interface PortfolioItem {
  id: number;
  image_url: string | null;
  title: string;
  category_name: string | null;
  category_slug: string | null;
  order: number;
}

const TEASER_LIMIT = 6;

export function Portfolio() {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const gridRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(() => {
    api.get<PortfolioItem[]>('/portfolio/')
      .then(portfolio => setItems(portfolio))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!titleRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(titleRef.current!.children, {
        y: 60, opacity: 0, stagger: 0.1, duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: { trigger: titleRef.current, start: 'top 82%' },
      });
    });
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (loading || !gridRef.current) return;
    const cards = gridRef.current.querySelectorAll('.portfolio-card');
    const ctx = gsap.context(() => {
      gsap.from(cards, {
        y: 40, opacity: 0, stagger: 0.07, duration: 0.7,
        ease: 'power3.out',
        scrollTrigger: { trigger: gridRef.current, start: 'top 85%' },
      });
    });
    return () => ctx.revert();
  }, [loading, items.length]);

  const teaser = items.slice(0, TEASER_LIMIT);

  return (
    <section
      id="portfolio"
      style={{
        background: '#fff', padding: '120px 0',
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 32px' }}>
        <div ref={titleRef} style={{ marginBottom: 48 }}>
          <p style={{
            fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase',
            color: '#888', marginBottom: 12, fontWeight: 500,
          }}>
            Portfolio
          </p>
          <h2 style={{
            fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 300,
            color: '#111', letterSpacing: '-0.02em', margin: '0 0 24px',
          }}>
            Selected Work
          </h2>
          <Link
            to="/portfolio"
            style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#111',
              textDecoration: 'none',
              borderBottom: '1px solid #111',
              paddingBottom: 4,
            }}
          >
            View full portfolio
          </Link>
        </div>

        {!loading && items.length === 0 && (
          <p style={{ color: '#888', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>
            Portfolio coming soon.
          </p>
        )}

        <div
          ref={gridRef}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            width: '100%',
            marginBottom: items.length > TEASER_LIMIT ? 40 : 0,
          }}
        >
          {teaser.map(item => (
            <div
              key={item.id}
              className="portfolio-card"
              style={{ width: '100%', background: '#f5f5f5' }}
            >
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt={item.title}
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {items.length > TEASER_LIMIT && (
          <div style={{ textAlign: 'center' }}>
            <Link
              to="/portfolio"
              style={{
                display: 'inline-block',
                padding: '12px 28px',
                background: '#111',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              View full portfolio
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
