import type { ReactNode } from 'react';
import { HomepagePreview, type PreviewCategory, type PreviewPortfolioItem, type PreviewSlide } from './HomepagePreview';

interface HomepagePreviewModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  heroSlides: PreviewSlide[];
  portfolioItems: PreviewPortfolioItem[];
  categories: PreviewCategory[];
  pendingItems?: PreviewPortfolioItem[];
  footer?: ReactNode;
}

export function HomepagePreviewModal({
  open,
  onClose,
  title = 'Homepage preview',
  heroSlides,
  portfolioItems,
  categories,
  pendingItems,
  footer,
}: HomepagePreviewModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 960, background: '#fff',
          boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #eee',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>{title}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
              This is how the public homepage will look. Unsaved library edits are included.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: 24, lineHeight: 1,
              cursor: 'pointer', color: '#666', padding: 4,
            }}
            aria-label="Close preview"
          >
            ×
          </button>
        </div>

        <HomepagePreview
          heroSlides={heroSlides}
          portfolioItems={portfolioItems}
          categories={categories}
          pendingItems={pendingItems}
        />

        {footer && (
          <div style={{
            padding: '16px 20px', borderTop: '1px solid #eee',
            display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
