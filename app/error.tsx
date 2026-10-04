'use client';

/**
 * Route-level error boundary. Shows a friendly English message — never a stack
 * trace or internal detail (those are logged server-side).
 */
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-content px-4 py-24 text-center sm:px-6">
      <p className="section-title">Error</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-paper">
        Something went wrong
      </h1>
      <p className="mt-3 text-sm text-paper/55">
        The service is temporarily unavailable. Please try again in a moment.
      </p>
      <button type="button" onClick={() => reset()} className="btn mt-8">
        Try again
      </button>
    </main>
  );
}
