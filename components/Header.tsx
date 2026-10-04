import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { getSiteTitle } from '@/lib/db/repositories/settings';
import { SkipLink } from '@/components/SkipLink';

/**
 * Public site header: the main page title (centered, customizable from the
 * admin area — default "The HashFork List") — Admin (right).
 *
 * The centered title is width-capped and truncated so a long admin-chosen
 * title can never overlap the Admin button on small screens.
 */
export function Header() {
  const title = getSiteTitle(getDb());
  return (
    <>
      <SkipLink label="Skip to the list" />
      <header className="sticky top-0 z-30 border-b border-paper/10 bg-ink/90 backdrop-blur supports-[backdrop-filter]:bg-ink/75">
        <div className="relative mx-auto flex h-14 max-w-content items-center px-4 sm:h-16 sm:px-6">
          <Link
            href="/"
            className="absolute left-1/2 max-w-[calc(100%-9rem)] -translate-x-1/2 truncate text-base font-semibold tracking-tight text-paper transition-opacity hover:opacity-90 sm:text-xl"
          >
            {title}
          </Link>
          <Link
            href="/admin"
            className="ml-auto inline-flex h-11 shrink-0 items-center rounded-sm border border-paper/25 px-2.5 text-xs font-medium text-paper/85 transition-colors duration-150 hover:border-paper/60 hover:bg-paper/5 hover:text-paper sm:h-9 sm:px-3 sm:text-sm"
          >
            Admin
          </Link>
        </div>
      </header>
    </>
  );
}
