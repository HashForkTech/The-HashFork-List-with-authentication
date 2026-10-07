'use client';

import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { SkipLink } from '@/components/SkipLink';

type AdminLayoutProps = {
  children: ReactNode;
  /** Route leaving the admin area through the existing unsaved-changes guard. */
  guardLeave?: (proceed: () => void) => void;
  onLogout?: () => void;
  logoutBusy?: boolean;
};

/** Shared chrome for the admin pages (never indexed by search engines). */
export function AdminLayout({ children, guardLeave, onLogout, logoutBusy }: AdminLayoutProps) {
  const guardedClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!guardLeave) return;
    event.preventDefault();
    guardLeave(() => window.location.assign('/'));
  };

  return (
    <div className="min-h-screen bg-ink">
      <SkipLink label="Skip to the dashboard" />
      <header className="border-b border-paper/10">
        <div className="mx-auto flex h-14 max-w-content items-center gap-3 px-4 sm:h-16 sm:px-6">
          <Link href="/" onClick={guardedClick} className="min-w-0 truncate text-base font-semibold tracking-tight text-paper transition-opacity hover:opacity-90 sm:text-lg">
            The HashFork List
          </Link>
          <span className="hidden text-xs uppercase tracking-[0.18em] text-paper/35 sm:inline">admin</span>
          <Link href="/" onClick={guardedClick} className="ml-auto shrink-0 text-sm text-paper/60 underline-offset-2 transition-colors hover:text-paper hover:underline">View site</Link>
          {onLogout ? <button type="button" className="btn shrink-0" disabled={logoutBusy} onClick={onLogout}>{logoutBusy ? 'Signing out…' : 'Sign out'}</button> : null}
        </div>
      </header>
      {children}
    </div>
  );
}
