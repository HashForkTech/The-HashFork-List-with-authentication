/**
 * Minimal server-side logger. Secrets, tokens and password material must
 * never reach these methods: context keys that look sensitive are dropped.
 */

type Level = 'info' | 'warn' | 'error';

const SENSITIVE_KEY = /password|secret|token|hash|cookie|authorization/i;

function sanitize(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : value;
  }
  return out;
}

function write(level: Level, message: string, context?: Record<string, unknown>): void {
  const line = `[hashfork:${level}] ${message}`;
  const suffix = context ? ` ${JSON.stringify(sanitize(context))}` : '';
  if (level === 'error') console.error(line + suffix);
  else if (level === 'warn') console.warn(line + suffix);
  else console.log(line + suffix);
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
};
