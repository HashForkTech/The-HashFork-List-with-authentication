'use client';

import { useEffect, useRef, useState } from 'react';

type DescriptionTextProps = {
  id: string;
  description: string;
};

/**
 * Resource description clamped to two rendered lines (CSS line clamp — the
 * visual result is limited to two lines, never cut mid-word by a character
 * count). Tapping/clicking the description — hovering it with a mouse, or
 * focusing it with the keyboard — reveals the complete text in a popover
 * styled like the "Comment" popup: it is absolutely positioned, so it never
 * disturbs the surrounding layout, and it is wide (and scrollable when very
 * long) so the text stays readable. Tapping it again, clicking outside or
 * pressing Escape hides it again — so the full text is reachable on touch
 * devices too, not only where a hover exists.
 */
export function DescriptionText({ id, description }: DescriptionTextProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className="group relative mt-1.5"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((current) => !current)}
    >
      <p
        tabIndex={0}
        aria-expanded={open}
        aria-describedby={`item-description-${id}`}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        title="Show or hide the full description"
        className="line-clamp-2 max-w-3xl cursor-pointer whitespace-pre-wrap break-words text-sm leading-relaxed text-paper/65 sm:text-[0.95rem]"
      >
        {description}
      </p>
      <span
        id={`item-description-${id}`}
        role="tooltip"
        onClick={(event) => event.stopPropagation()}
        className={`absolute left-0 top-full z-20 mt-2 max-h-[60vh] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto whitespace-pre-wrap break-words rounded-sm border border-paper/20 bg-[#1a1a1a] p-3 text-left text-sm leading-relaxed text-paper/85 shadow-[0_12px_40px_rgba(0,0,0,0.55)] transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${
          open ? 'visible opacity-100' : 'invisible opacity-0'
        }`}
      >
        {description}
      </span>
    </div>
  );
}
