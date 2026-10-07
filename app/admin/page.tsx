import { AuthGate } from '@/components/admin/AuthGate';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Administration',
  robots: { index: false, follow: false },
};

/** Admin data is fetched in the browser only after a bearer session is established. */
export default function AdminPage() {
  return <AuthGate />;
}
