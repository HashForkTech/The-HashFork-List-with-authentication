import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

/** Kept for old links: the dashboard now lives directly at /admin. */
export default function AdminDashboardRedirect() {
  redirect('/admin');
}
