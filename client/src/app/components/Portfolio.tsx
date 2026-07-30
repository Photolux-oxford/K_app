import { useCallback, useEffect, useRef, useState } from 'react';
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

interface Category {
  id: number;
  name: string;
  slug: string;
  published_count: number;
}

export function Portfolio() {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const gridRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(() => {
    Promise.all([
      api.get<PortfolioItem[]>('/portfolio/'),
      api.get<Category[]>('/portfolio/categories/'),
    ])
      .then(([portfolio, cats]) => {
        setItems(portfolio);
        setCategories(cats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

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
  }, [loading, activeCategory]);

  const filtered = activeCategory === 'All'
    ? items
    : items.filter(item => item.category_slug === activeCategory);

  const filterPills = ['All', ...categories.map(c => c.slug)];

  return (
    <section
      id="portfolio"
      ref={sectionRef}
      style={{
        background: '#fff', padding: '120px 0',
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px' }}>
        <div ref={titleRef} style={{ marginBottom: 56 }}>
          <p style={{
            fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase',
            color: '#888', marginBottom: 12, fontWeight: 500,
          }}>
            Portfolio
          </p>
          <h2 style={{
            fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 300,
            color: '#111', letterSpacing: '-0.02em', margin: 0,
          }}>
            Selected Work
          </h2>
        </div>

        {categories.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 48 }}>
            {filterPills.map(slug => {
              const label = slug === 'All' ? 'All' : (categories.find(c => c.slug === slug)?.name ?? slug);
              return (
                <button
                  key={slug}
                  onClick={() => setActiveCategory(slug)}
                  style={{
                    padding: '8px 20px',
                    background: activeCategory === slug ? '#111' : 'transparent',
                    color: activeCategory === slug ? '#fff' : '#888',
                    border: activeCategory === slug ? '1px solid #111' : '1px solid #ddd',
                    fontFamily: "'Helvetica Neue', Arial, sans-serif",
                    fontSize: 11, fontWeight: 500, letterSpacing: '0.1em',
                    textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {!loading && items.length === 0 && (
          <p style={{ color: '#888', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>
            Portfolio coming soon.
          </p>
        )}

        <div
          ref={gridRef}
          className="portfolio-grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}
        >
          {filtered.map(item => (
            <div
              key={item.id}
              className="portfolio-card"
              style={{
                position: 'relative', overflow: 'hidden', aspectRatio: '1',
                background: '#f5f5f5', cursor: 'pointer',
              }}
              onMouseEnter={e => gsap.to(e.currentTarget.querySelector('img'), { scale: 0.96, duration: 0.4, ease: 'power2.out' })}
              onMouseLeave={e => gsap.to(e.currentTarget.querySelector('img'), { scale: 1.04, duration: 0.4, ease: 'power2.out' })}
            >
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt={item.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: 'scale(1.04)' }}
                />
              )}
              {item.category_name && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', padding: 16,
                }}>
                  <span style={{
                    fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                    color: '#fff', fontWeight: 500, opacity: 0,
                  }} className="portfolio-tag">
                    {item.category_name}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {filtered.length === 0 && items.length > 0 && !loading && (
          <p style={{ color: '#888', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>
            No images in this category yet.
          </p>
        )}
      </div>
    </section>
  );
}
