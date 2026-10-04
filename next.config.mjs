/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep native modules (SQLite, Argon2) out of the webpack bundle so their
  // prebuilt binaries are loaded from node_modules at runtime.
  serverExternalPackages: ['better-sqlite3', '@node-rs/argon2'],
  // Emits .next/standalone for container deployments (see README).
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
