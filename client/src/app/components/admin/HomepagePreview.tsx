import { useEffect, useState } from 'react';

export interface PreviewSlide {
  image_url: string;
  title?: string;
  position_x?: number;
  position_y?: number;
  fit_mode?: 'cover' | 'contain';
}

export interface PreviewPortfolioItem {
  id: number | string;
  image_url: string;
  title: string;
  category_name: string | null;
  category_slug: string | null;
}

export interface PreviewCategory {
  name: string;
  slug: string;
}

interface HomepagePreviewProps {
  heroSlides: PreviewSlide[];
  portfolioItems: PreviewPortfolioItem[];
  categories: PreviewCategory[];
  pendingItems?: PreviewPortfolioItem[];
  compact?: boolean;
}

export function HomepagePreview({
  heroSlides,
  portfolioItems,
  categories,
  pendingItems = [],
  compact = false,
}: HomepagePreviewProps) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [heroIdx, setHeroIdx] = useState(0);

  const slides = heroSlides.length > 0 ? heroSlides : [];
  const allItems = [...portfolioItems, ...pendingItems];

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setHeroIdx(i => (i + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, [slides.length]);

  const filtered = activeCategory === 'All'
    ? allItems
    : allItems.filter(i => i.category_slug === activeCategory);

  const pills = ['All', ...categories.map(c => c.slug)];

  const heroH = compact ? 320 : 500;

  return (
    <div style={{
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      background: '#fff',
      border: '1px solid #e8e8e8',
      overflow: 'hidden',
    }}>
      {/* Hero */}
      <section style={{ position: 'relative', height: heroH, background: '#1a1a1a', overflow: 'hidden' }}>
        {slides.length > 0 ? slides.map((slide, i) => (
          <img
            key={i}
            src={slide.image_url}
            alt={slide.title || 'Hero'}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: slide.fit_mode ?? 'cover',
              objectPosition: `${slide.position_x ?? 50}% ${slide.position_y ?? 50}%`,
              opacity: i === heroIdx ? 1 : 0,
              transition: 'opacity 1.2s ease',
              zIndex: 0,
            }}
          />
        )) : (
          <div style={{ position: 'absolute', inset: 0, background: '#2a2a2a', zIndex: 0 }} />
        )}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.12) 60%, rgba(0,0,0,0.5) 100%)',
        }} />
        {/* Top-left branding */}
        <p style={{
          position: 'absolute', top: compact ? 16 : 24, left: compact ? 20 : 28, zIndex: 2,
          fontSize: compact ? 8 : 10, letterSpacing: '0.3em', textTransform: 'uppercase',
          color: '#fff', opacity: 0.85, margin: 0,
        }}>
          Oxford · Photography
        </p>
        {/* Bottom-left name */}
        <h2 style={{
          position: 'absolute', bottom: compact ? 16 : 24, left: compact ? 20 : 28, zIndex: 2,
          fontSize: compact ? 22 : 32, fontWeight: 300, letterSpacing: '-0.01em',
          color: '#fff', margin: 0,
        }}>
          Photolux Oxford
        </h2>
        {/* Bottom-right buttons */}
        <div style={{
          position: 'absolute', bottom: compact ? 16 : 24, right: compact ? 20 : 28, zIndex: 2,
          display: 'flex', gap: 8,
        }}>
          <span style={{
            padding: compact ? '5px 10px' : '7px 14px',
            background: 'rgba(255,255,255,0.95)', color: '#111',
            fontSize: compact ? 7 : 9, fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            Request a Session
          </span>
          <span style={{
            padding: compact ? '5px 10px' : '7px 14px',
            border: '1px solid rgba(255,255,255,0.7)', color: '#fff',
            fontSize: compact ? 7 : 9, fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            Editing
          </span>
        </div>
        {slides.length === 0 && (
          <p style={{
            position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center',
            color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0, zIndex: 2,
          }}>
            No hero slides assigned — use the Hero tab to add photos
          </p>
        )}
      </section>

      {/* Portfolio */}
      <section style={{ padding: compact ? '40px 24px' : '64px 32px' }}>
        <p style={{
          fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase',
          color: '#888', marginBottom: 8,
        }}>
          Portfolio
        </p>
        <h3 style={{ fontSize: compact ? 28 : 40, fontWeight: 300, margin: '0 0 24px', color: '#111' }}>
          Selected Work
        </h3>

        {categories.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 24 }}>
            {pills.map(slug => {
              const label = slug === 'All' ? 'All' : (categories.find(c => c.slug === slug)?.name ?? slug);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => setActiveCategory(slug)}
                  style={{
                    padding: '6px 14px', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                    border: activeCategory === slug ? '1px solid #111' : '1px solid #ddd',
                    background: activeCategory === slug ? '#111' : 'transparent',
                    color: activeCategory === slug ? '#fff' : '#888', cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {pendingItems.length > 0 && (
          <p style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', padding: '10px 14px', marginBottom: 16 }}>
            {pendingItems.length} new photo(s) shown below — they will not appear on the live site until uploaded and published.
          </p>
        )}

        {allItems.length === 0 ? (
          <p style={{ color: '#888', fontSize: 14, textAlign: 'center', padding: '32px 0' }}>
            Portfolio coming soon — publish photos in the Library to see them here.
          </p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: compact ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
            gap: 8,
          }}>
            {filtered.map(item => (
              <div key={item.id} style={{ aspectRatio: '1', overflow: 'hidden', background: '#f5f5f5' }}>
                <img src={item.image_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 && allItems.length > 0 && (
          <p style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: 24 }}>
            No published photos in this category.
          </p>
        )}
      </section>
    </div>
  );
}
