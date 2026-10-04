import { ImageResponse } from 'next/og';
import { getDb } from '@/lib/db/client';
import { getSiteTitle } from '@/lib/db/repositories/settings';
import { listItems } from '@/lib/db/repositories/items';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'The HashFork List — a curated AI resource list';
export const dynamic = 'force-dynamic';

/**
 * Social-sharing card, drawn in the site's own visual identity (ink/paper
 * monochrome). The title is the admin-configured site title and the count
 * mirrors the live library, so the card never goes stale.
 */
export default function OpengraphImage() {
  const db = getDb();
  const title = getSiteTitle(db);
  const itemCount = listItems(db).length;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#141414',
          color: '#dedede',
          padding: 80,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 22, letterSpacing: 4, color: '#8f8f8f' }}>
          CURATED · SELF-HOSTED · HAND-MAINTAINED
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: title.length > 26 ? 76 : 96,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1.05,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderBottom: `1px solid rgba(222,222,222,0.35)`,
            paddingBottom: 24,
            fontSize: 26,
            color: '#a8a8a8',
          }}
        >
          <div style={{ display: 'flex', maxWidth: 760 }}>
            GitHub projects · LLMs · models · AI tools — each with a tested-on date and rating
          </div>
          <div style={{ display: 'flex', fontWeight: 700, color: '#dedede', fontSize: 30 }}>
            {itemCount} resources
          </div>
        </div>
      </div>
    ),
    size,
  );
}
