/**
 * Keyboard "skip to content" link: visually hidden until it receives
 * keyboard focus, then it becomes the first visible, clearly outlined
 * element on the page. Points at the `<main id="main-content">` landmark of
 * the public list, the admin dashboard and the error pages.
 */
export function SkipLink({ href = '#main-content', label }: { href?: string; label: string }) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-sm focus:border focus:border-paper/50 focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-paper"
    >
      {label}
    </a>
  );
}
