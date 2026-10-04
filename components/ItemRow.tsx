import { Star } from 'lucide-react';
import { DescriptionText } from '@/components/DescriptionText';
import { LinkIcons } from '@/components/LinkIcons';
import { buildSearchText } from '@/lib/filtering';
import { formatOsDate } from '@/lib/format';
import type { ListItem } from '@/lib/types';

/**
 * One row of the public list:
 *   line 1 → left:  name, "Added on <date>" (to the right of the name; the
 *            creation date, stamped automatically from the OS date when the
 *            resource is created), then the icon links when the matching URLs
 *            exist
 *            right: "Tested on <date>" (when checked — the date is when the
 *                   admin checked the "Tested" checkbox), yellow stars (only
 *                   the rated ones — none when unrated), "Comment" link (when
 *                   a comment exists; hovering it pops the comment up)
 *   line 2 → description (muted, clamped to two lines; hovering it — or
 *            focusing it with the keyboard — pops the full text up)
 *
 * Rendered on the server and kept as a static DOM subtree: the category,
 * "Tested" and search filters only toggle visibility, so the row DOM survives
 * filtering. The searchable text rides on `data-item-search`.
 */

function Stars({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`Rated ${rating} out of 5 stars`}
    >
      {Array.from({ length: rating }, (_, index) => (
        <Star
          key={index}
          className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400"
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function CommentLink({ id, comment }: { id: string; comment: string }) {
  return (
    <span className="group relative inline-flex">
      <a
        href={`#item-${id}`}
        className="text-xs font-medium text-paper/75 underline decoration-paper/25 underline-offset-2 transition-colors duration-150 hover:text-paper hover:decoration-paper/60"
      >
        Comment
      </a>
      <span
        role="tooltip"
        className="invisible absolute right-0 top-full z-20 mt-2 w-72 whitespace-pre-wrap break-words rounded-sm border border-paper/20 bg-[#1a1a1a] p-3 text-left text-xs leading-relaxed text-paper/80 opacity-0 shadow-[0_12px_40px_rgba(0,0,0,0.55)] transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {comment}
      </span>
    </span>
  );
}

export function ItemRow({ item }: { item: ListItem }) {
  const name = item.name?.trim();
  const rating = Math.min(5, Math.max(0, Math.round(item.rating ?? 0)));
  const comment = item.comment?.trim();
  const description = item.description?.trim();
  const addedAt = formatOsDate(item.createdAt);
  const testedAt = item.testedAt ? formatOsDate(item.testedAt) : '';

  return (
    <article
      id={`item-${item.id}`}
      data-item-row="true"
      data-item-category={item.categoryId ?? ''}
      data-item-tested={item.tested ? 'true' : 'false'}
      data-item-search={buildSearchText(item)}
      className="border-b border-paper/10 transition-colors duration-150 hover:bg-paper/[0.03]"
    >
      <div className="px-1 py-5 sm:px-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="min-w-0 break-words text-[1.05rem] font-medium tracking-tight text-paper sm:text-lg">
              {name ? (
                name
              ) : (
                <span className="font-normal italic text-paper/40">Unnamed resource</span>
              )}
            </h2>
            {addedAt ? (
              <span className="whitespace-nowrap text-xs tracking-wide text-paper/45">
                {`Added on ${addedAt}`}
              </span>
            ) : null}
            <LinkIcons item={item} />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            {item.tested ? (
              <span className="text-xs font-semibold tracking-wide text-paper/75">
                {testedAt ? `Tested on ${testedAt}` : 'Tested'}
              </span>
            ) : null}
            {rating > 0 ? <Stars rating={rating} /> : null}
            {comment ? <CommentLink id={item.id} comment={comment} /> : null}
          </div>
        </div>
        {description ? <DescriptionText id={item.id} description={description} /> : null}
      </div>
    </article>
  );
}
