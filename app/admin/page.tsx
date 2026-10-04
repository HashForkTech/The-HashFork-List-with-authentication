import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { getDb } from '@/lib/db/client';
import { listCategories } from '@/lib/db/repositories/categories';
import { listItems } from '@/lib/db/repositories/items';
import { getSiteTitle } from '@/lib/db/repositories/settings';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Administration',
  robots: { index: false, follow: false },
};

/**
 * /admin — the administration dashboard.
 *
 * This build has NO login (by design): no accounts, no passwords, no cookies,
 * therefore no TLS certificate requirement. If the instance is reachable by
 * untrusted people, gate /admin (and /api) at the reverse proxy — see README
 * → "Admin area (no password)".
 */
export default function AdminPage() {
  const db = getDb();
  return (
    <AdminDashboard
      initialCategories={listCategories(db)}
      initialItems={listItems(db)}
      initialSiteTitle={getSiteTitle(db)}
    />
  );
}
