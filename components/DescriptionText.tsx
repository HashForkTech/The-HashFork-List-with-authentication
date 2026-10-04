'use client';

import { useState } from 'react';

type DescriptionTextProps = {
  id: string;
  description: string;
};

/**
 * Resource description clamped to two rendered lines (CSS line clamp — the
 * visual result is limited to two lines, never cut mid-word by a character
 * count). Hovering the description — or focusing it with the keyboard — pops
 * the complete text up in a tooltip styled like the "Comment" popup: it is
 * absolutely positioned, so it never disturbs the surrounding layout, and it
 * is wide (and scrollable when very long) so the text stays readable.
 *
 * Visibility is driven both by hover/focus state (so it is testable and works
 * for keyboard users) and by the same group-hover CSS used by the comment
 * tooltip.
 */
export function DescriptionText({ id, description }: DescriptionTextProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="group relative mt-1.5"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <p
        tabIndex={0}
        aria-describedby={`item-description-${id}`}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="line-clamp-2 max-w-3xl whitespace-pre-wrap break-words text-sm leading-relaxed text-paper/60 sm:text-[0.95rem]"
      >
        {description}
      </p>
      <span
        id={`item-description-${id}`}
        role="tooltip"
        className={`absolute left-0 top-full z-20 mt-2 max-h-[60vh] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto whitespace-pre-wrap break-words rounded-sm border border-paper/20 bg-[#1a1a1a] p-3 text-left text-sm leading-relaxed text-paper/80 shadow-[0_12px_40px_rgba(0,0,0,0.55)] transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${
          open ? 'visible opacity-100' : 'invisible opacity-0'
        }`}
      >
        {description}
      </span>
    </div>
  );
}
