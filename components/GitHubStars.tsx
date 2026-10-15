import { Star } from 'lucide-react';

/** Shared display for the manually entered GitHub star count. */
export function GitHubStars({ count }: { count: number | null | undefined }) {
  if (count == null) return null;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-paper/75"
      role="img"
      aria-label={`GitHub: ${count} star${count === 1 ? '' : 's'}`}
    >
      GitHub
      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" aria-hidden="true" />
      <span>{count}</span>
    </span>
  );
}
