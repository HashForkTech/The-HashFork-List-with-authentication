/**
 * Date formatting helpers — pure TypeScript (safe for client bundles).
 */

/** Formats a stored ISO timestamp as the OS (local) date: YYYY-MM-DD. */
export function formatOsDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
