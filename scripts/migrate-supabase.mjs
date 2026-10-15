import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('Set DATABASE_URL to your Supabase PostgreSQL connection string.');
let parsedUrl;
try { parsedUrl = new URL(databaseUrl); }
catch { throw new Error('DATABASE_URL is not a valid PostgreSQL connection string.'); }
if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
  throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
}
for (const key of Array.from(parsedUrl.searchParams.keys())) {
  if (key.toLowerCase().startsWith('ssl')) parsedUrl.searchParams.delete(key);
}
if ((process.env.NODE_ENV === 'production' || process.env.VERCEL) && process.env.DATABASE_SSL === 'false') {
  throw new Error('TLS cannot be disabled for production migrations.');
}
const caFile = process.env.DATABASE_CA_CERT?.trim();
const pool = new Pool({
  connectionString: parsedUrl.toString(),
  max: 1,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env.DATABASE_SSL === 'false' ? false : {
    rejectUnauthorized: true,
    ...(caFile ? { ca: fs.readFileSync(caFile, 'utf8') } : {}),
  },
});
pool.on('error', () => console.error('PostgreSQL connection unavailable.'));
try {
  const directory = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
  const migrations = fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
  for (const name of migrations) {
    await pool.query(fs.readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'));
    console.log('Applied migration: ' + name);
  }
  console.log('Supabase schema is up to date. Browser Data API access is disabled for app tables.');
} finally {
  await pool.end();
}
