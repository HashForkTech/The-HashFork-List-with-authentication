import Link from 'next/link';
import { Header } from '@/components/Header';

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-content px-4 py-24 text-center sm:px-6">
        <p className="section-title">Error 404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-paper">Page not found</h1>
        <p className="mt-3 text-sm text-paper/55">
          The requested page does not exist or has been moved.
        </p>
        <Link href="/" className="btn mt-8">
          Back to the list
        </Link>
      </main>
    </>
  );
}
