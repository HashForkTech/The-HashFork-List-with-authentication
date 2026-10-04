/** Minimal wrapper around the Simple Icons brand marks. */
export type BrandMark = { path: string };

export function BrandIcon({
  icon,
  className,
}: {
  icon: BrandMark;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={icon.path} />
    </svg>
  );
}
