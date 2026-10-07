import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/inter';
import { getStore } from '@/lib/db/store';
import { getSiteTitle } from '@/lib/db/repositories/settings';
import './globals.css';

// One-liner for the page <meta>, Open Graph and Twitter card. Kept under 160
// characters so search engines and link previews don't cut the end off. It
// deliberately omits the site name: the title is admin-configurable.
const SITE_DESCRIPTION =
  'A self-hosted, hand-curated directory of GitHub projects, LLMs, models and AI tools — each with a tested-on date, star rating and notes.';

const appUrl = process.env.APP_URL?.trim() || 'http://localhost:3000';

// Render every page dynamically for live metadata and per-request script nonces.
export const dynamic = 'force-dynamic';

// The title of the main page is customizable from the admin area (default
// "The HashFork List") and feeds the browser tab title and social metadata.
export async function generateMetadata(): Promise<Metadata> {
  const siteName = await getSiteTitle(getStore());
  return {
    metadataBase: new URL(appUrl),
    title: {
      default: siteName,
      template: `%s · ${siteName}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: siteName,
    keywords: [
      'artificial intelligence',
      'LLM',
      'models',
      'AI tools',
      'GitHub',
      'Hugging Face',
      'open source',
    ],
    openGraph: {
      type: 'website',
      locale: 'en_US',
      siteName,
      title: siteName,
      description: SITE_DESCRIPTION,
      url: appUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title: siteName,
      description: SITE_DESCRIPTION,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#141414',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
    // attributes into <html>/<body> before React hydrates. This silences the
    // resulting attribute-only mismatch; it does NOT affect the subtree.
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen bg-ink font-sans text-paper antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
