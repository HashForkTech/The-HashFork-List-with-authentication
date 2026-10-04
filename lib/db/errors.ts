/** SQLite constraint helpers shared by the repositories/services. */
export function isConstraintViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code ?? '';
  return (
    code.startsWith('SQLITE_CONSTRAINT') ||
    /UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(error.message)
  );
}
