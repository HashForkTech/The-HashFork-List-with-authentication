import { Directory } from '@/components/Directory';
import { Header } from '@/components/Header';
import { ItemRow } from '@/components/ItemRow';
import { getStore } from '@/lib/db/store';
import { listCategories } from '@/lib/db/repositories/categories';
import { listItems } from '@/lib/db/repositories/items';
import { getSiteTitle } from '@/lib/db/repositories/settings';

// Always rendered fresh from the configured database (admin edits show up at once).
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const db = getStore();
  const [siteTitle, categories, items] = await Promise.all([getSiteTitle(db), listCategories(db), listItems(db)]);

  // Category id → display name, so each row can show its category chip.
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  return (
    <>
      <Header />
      <main id="main-content" className="mx-auto w-full max-w-content px-4 pb-24 sm:px-6">
        <h1 className="sr-only">{siteTitle} — curated AI resource list</h1>

        {items.length === 0 ? (
          <div className="border-t border-paper/10">
            <p className="px-1 py-20 text-center text-sm text-paper/60">
              No resources yet.
            </p>
          </div>
        ) : (
          <Directory categories={categories}>
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                categoryName={
                  item.categoryId ? categoryNames.get(item.categoryId) : undefined
                }
              />
            ))}
          </Directory>
        )}
      </main>
      <footer className="border-t border-paper/10">
        <div className="mx-auto flex max-w-content items-center justify-between gap-3 px-4 py-6 text-xs text-paper/60 sm:px-6">
          <span>{siteTitle}</span>
          <span>Hand-curated list</span>
        </div>
      </footer>
    </>
  );
}
