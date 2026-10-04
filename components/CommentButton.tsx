'use client';

import { useEffect, useRef, useState } from 'react';

type CommentButtonProps = {
  id: string;
  comment: string;
};

/**
 * "Comment" affordance of a list row: a real button (works on touch, mouse
 * and keyboard alike) that toggles a popover with the admin's note. The
 * popover also closes on outside clicks and with the Escape key, so no
 * hover-capable pointer is required to read a comment — unlike the old
 * hover-only tooltip, which was a dead end on phones.
 */
export function CommentButton({ id, comment }: CommentButtonProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

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
    <span ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`item-comment-${id}`}
        onClick={() => setOpen((current) => !current)}
        className="text-xs font-medium text-paper/75 underline decoration-paper/25 underline-offset-2 transition-colors duration-150 hover:text-paper hover:decoration-paper/60"
      >
        Comment
      </button>
      <span
        id={`item-comment-${id}`}
        role="tooltip"
        className={`absolute right-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] whitespace-pre-wrap break-words rounded-sm border border-paper/20 bg-[#1a1a1a] p-3 text-left text-xs leading-relaxed text-paper/85 shadow-[0_12px_40px_rgba(0,0,0,0.55)] transition-opacity duration-150 ${
          open ? 'visible opacity-100' : 'invisible opacity-0'
        }`}
      >
        {comment}
      </span>
    </span>
  );
}
