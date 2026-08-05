import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { api } from '../lib/api';

const FONT = "'Helvetica Neue', Arial, sans-serif";

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

export function PortfolioPage() {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

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
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const filtered = activeCategory === 'All'
    ? items
    : items.filter(item => item.category_slug === activeCategory);

  const activeLabel = activeCategory === 'All'
    ? 'All'
    : (categories.find(c => c.slug === activeCategory)?.name ?? activeCategory);

  return (
    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: FONT }}>
      <Header />
      <main style={{ padding: '96px 0 80px' }}>
        <div style={{
          maxWidth: 820,
          margin: '0 auto',
          padding: '0 clamp(20px, 4vw, 40px)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 24,
            marginBottom: 40,
            flexWrap: 'wrap',
          }}>
            <div>
              <p style={{
                fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase',
                color: '#888', margin: '0 0 10px', fontWeight: 500,
              }}>
                Portfolio
              </p>
              <h1 style={{
                fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 300,
                color: '#111', letterSpacing: '-0.02em', margin: 0,
              }}>
                Selected Work
              </h1>
            </div>

            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(o => !o)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  background: '#fff',
                  border: '1px solid #ddd',
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#111',
                  cursor: 'pointer',
                  minWidth: 160,
                  justifyContent: 'space-between',
                }}
              >
                <span>{activeLabel}</span>
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    fontSize: 10,
                    lineHeight: 1,
                    transform: menuOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s',
                  }}
                >
                  V
                </span>
              </button>

              {menuOpen && (
                <ul
                  role="listbox"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    right: 0,
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                    background: '#fff',
                    border: '1px solid #ddd',
                    minWidth: '100%',
                    zIndex: 20,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                  }}
                >
                  {['All', ...categories.map(c => c.slug)].map(slug => {
                    const label = slug === 'All'
                      ? 'All'
                      : (categories.find(c => c.slug === slug)?.name ?? slug);
                    const selected = slug === activeCategory;
                    return (
                      <li key={slug}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            setActiveCategory(slug);
                            setMenuOpen(false);
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px 14px',
                            border: 'none',
                            background: selected ? '#f5f5f5' : '#fff',
                            fontFamily: FONT,
                            fontSize: 11,
                            fontWeight: selected ? 600 : 400,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: '#111',
                            cursor: 'pointer',
                          }}
                        >
                          {label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {loading && (
            <p style={{ color: '#888', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>
              Loading…
            </p>
          )}

          {!loading && items.length === 0 && (
            <p style={{ color: '#888', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>
              Portfolio coming soon.
            </p>
          )}

          {!loading && filtered.length === 0 && items.length > 0 && (
            <p style={{ color: '#888', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>
              No images in this category yet.
            </p>
          )}

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            width: '100%',
          }}>
            {filtered.map(item => (
              <figure
                key={item.id}
                style={{ margin: 0, width: '100%' }}
              >
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.title || 'Portfolio'}
                    style={{
                      display: 'block',
                      width: '100%',
                      height: 'auto',
                      verticalAlign: 'top',
                    }}
                  />
                )}
              </figure>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
