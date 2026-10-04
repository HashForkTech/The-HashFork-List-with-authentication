import { Star } from 'lucide-react';
import { CommentButton } from '@/components/CommentButton';
import { DescriptionText } from '@/components/DescriptionText';
import { LinkIcons } from '@/components/LinkIcons';
import { buildSearchText } from '@/lib/filtering';
import { formatOsDate } from '@/lib/format';
import type { ListItem } from '@/lib/types';

/**
 * One row of the public list:
 *   line 1 → left:  name, "Added on <date>" (to the right of the name; the
 *            creation date, stamped automatically from the OS date when the
 *            resource is created), the category chip (when categorised),
 *            then the icon links when the matching URLs exist
 *            right: "Tested on <date>" (when checked — the date is when the
 *                   admin checked the "Tested" checkbox), stars on a 5-slot
 *                   scale (only the rated ones — none when unrated),
 *                   "Comment" button (when a comment exists; tapping it
 *                   toggles the note popover)
 *   line 2 → description (muted, clamped to two lines; tapping/hovering/
 *            focusing it pops the full text up)
 *
 * Rendered on the server and kept as a static DOM subtree: the category,
 * "Tested" and search filters toggle visibility and the sort control
 * re-orders rows, all through the DOM — so the row DOM survives every view
 * change. The searchable text rides on `data-item-search`; `data-item-
 * created` / `-name` / `-rating` drive the sorting.
 */

function Stars({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`Rated ${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          className={
            index < rating
              ? 'h-3.5 w-3.5 fill-yellow-400 text-yellow-400'
              : 'h-3.5 w-3.5 text-paper/25'
          }
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

type ItemRowProps = {
  item: ListItem;
  /** Display name of the item's category; omitted when unclassified. */
  categoryName?: string;
};

export function ItemRow({ item, categoryName }: ItemRowProps) {
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
      data-item-created={item.createdAt}
      data-item-name={(name ?? '').toLocaleLowerCase()}
      data-item-rating={rating}
      className="border-b border-paper/10 transition-colors duration-150 hover:bg-paper/[0.03]"
    >
      <div className="px-1 py-5 sm:px-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="min-w-0 break-words text-[1.05rem] font-medium tracking-tight text-paper sm:text-lg">
              {name ? (
                name
              ) : (
                <span className="font-normal italic text-paper/55">Unnamed resource</span>
              )}
            </h2>
            {addedAt ? (
              <span className="whitespace-nowrap text-xs tracking-wide text-paper/65">
                {`Added on ${addedAt}`}
              </span>
            ) : null}
            {categoryName ? (
              <span className="shrink-0 rounded-sm border border-paper/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-paper/65">
                {categoryName}
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
            {comment ? <CommentButton id={item.id} comment={comment} /> : null}
          </div>
        </div>
        {description ? <DescriptionText id={item.id} description={description} /> : null}
      </div>
    </article>
  );
}
