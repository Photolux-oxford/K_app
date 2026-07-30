import type { PreviewCategory, PreviewPortfolioItem, PreviewSlide } from './HomepagePreview';

export interface AdminCategory {
  id: number;
  name: string;
  slug: string;
}

export interface AdminPortfolioItem {
  id: number;
  title: string;
  image_url: string | null;
  category_id: number | null;
  category_name: string | null;
  published: boolean;
  order: number;
  hero_slot: number | null;
}

export interface AdminHeroSlot {
  slot_number: number;
  position_x: number;
  position_y: number;
  fit_mode: 'cover' | 'contain';
  portfolio_item: { id: number; image_url: string; title: string } | null;
}

export function buildPreviewFromAdmin(
  items: AdminPortfolioItem[],
  categories: AdminCategory[],
  slots: AdminHeroSlot[],
  draftItem?: AdminPortfolioItem | null,
): {
  heroSlides: PreviewSlide[];
  portfolioItems: PreviewPortfolioItem[];
  categories: PreviewCategory[];
} {
  const merged = items.map(i => (draftItem && i.id === draftItem.id ? draftItem : i));

  const heroSlides: PreviewSlide[] = slots
    .filter(s => s.portfolio_item?.image_url)
    .sort((a, b) => a.slot_number - b.slot_number)
    .map(s => ({
      image_url: s.portfolio_item!.image_url,
      title: s.portfolio_item!.title,
      position_x: s.position_x,
      position_y: s.position_y,
      fit_mode: s.fit_mode,
    }));

  const published = merged
    .filter(i => i.published && i.image_url)
    .sort((a, b) => a.order - b.order);

  const portfolioItems: PreviewPortfolioItem[] = published.map(i => {
    const cat = categories.find(c => c.id === i.category_id);
    return {
      id: i.id,
      image_url: i.image_url!,
      title: i.title,
      category_name: cat?.name ?? i.category_name,
      category_slug: cat?.slug ?? null,
    };
  });

  const previewCategories: PreviewCategory[] = categories
    .filter(c => published.some(p => {
      const item = merged.find(m => m.id === p.id);
      return item?.category_id === c.id;
    }))
    .map(c => ({ name: c.name, slug: c.slug }));

  return { heroSlides, portfolioItems, categories: previewCategories };
}
