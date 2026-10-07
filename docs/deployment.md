# Deployment guide

Docker and Node hosting use a persistent SQLite database. Vercel uses Supabase Postgres. Both use the same cookie-free admin login and optional authenticator-app 2FA.

## Secrets and first-login setup

Generate **independent** random values and save them in the hosting platform's server-side secret configuration, or in an ignored local `.env`:

```bash
openssl rand -hex 32       # ADMIN_SETUP_TOKEN
openssl rand -base64 32    # AUTH_ENCRYPTION_KEY
```

`ADMIN_SETUP_TOKEN` protects first-login setup; it must contain at least 32 characters. It is not the admin password. At `/admin`, present this setup token and choose the password. Setup closes once the single admin is created. A new blank database requires setup again; restoring the old database preserves its admin.

`AUTH_ENCRYPTION_KEY` is exactly 32 random bytes encoded as base64 and is required for admin setup and 2FA. It encrypts the TOTP shared secret. Keep it outside the database and preserve it across restarts, redeployments and restores. Changing it without migrating the encrypted data makes existing MFA secrets unreadable.

The app retains only a salted Argon2id password verifier. It does not persist or log passwords. Sessions use random bearer tokens whose hashes are stored server-side; the browser holds its token only in memory. No session cookies, `localStorage` or `sessionStorage` are used. Refreshing the page requires sign-in again.

Never give database or authentication secrets a `NEXT_PUBLIC_` prefix. Never pass them as Docker build arguments or copy your real `.env` into an image. `.dockerignore` excludes environment files, local databases and TLS private keys.

## Local HTTPS

OpenSSL is required; on Windows it must be on `PATH`, or set `OPENSSL_BIN` to its executable.

```bash
npm ci --ignore-scripts
cp .env.example .env
# Fill ADMIN_SETUP_TOKEN and AUTH_ENCRYPTION_KEY in .env.
npm run certs:generate
npm run dev:https
```

The certificate/key pair is stored in the ignored `certificates/` directory. The certificate includes `localhost`, `127.0.0.1` and `::1` as subject alternative names and lasts one year. The HTTPS development server binds to `127.0.0.1` and serves <https://localhost:3000>. Use `PORT` and the corresponding `APP_URL` to choose another port.

This certificate is self-signed. Trust its public certificate in your local browser or accept the localhost warning for this test. Do not share or install the private key. Do not use this test certificate for a public deployment. To replace an expired certificate, run `npm run certs:generate -- --force`.

The launcher passes the generated pair explicitly to [Next.js's HTTPS development options](https://nextjs.org/docs/app/api-reference/cli/next). It generates the pair automatically when neither file exists. If only one file remains, regenerate both with `--force`.

## Docker with SQLite

The image uses Node 24 on Debian, tests the SQLite native module while installing dependencies, builds the Next.js standalone output and includes its static assets. The final application runs as the unprivileged `node` user. It needs no external database.

The named `hashfork-data` volume stores content and authentication state under `/data`. Keep this volume when replacing the container. Avoid `docker compose down --volumes` unless you intend to remove the stored content and admin account.

### Local container HTTPS test

Fill both auth secrets in `.env`, then:

```bash
npm run certs:generate
docker compose -f docker-compose.yml -f docker-compose.https.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.https.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.https.yml ps
```

Open <https://localhost:8443>. The overlay mounts the localhost certificate read-only into an nginx TLS proxy and sets the correct HTTPS origin for the app. It publishes TLS only on localhost. It deliberately leaves HSTS off for this self-signed test.

For a checkout under WSL on Windows, enable Docker Desktop integration for that Ubuntu distribution before using these bind mounts. Without it, the local TLS overlay can fail to access the certificate/config paths even though image builds and named volumes work. This machine was tested using temporary Windows copies of those test files.

A health check probes `/api/health` inside the application container. It checks **process liveness**, not database readiness; test the public list and authenticated API separately.

### Production HTTPS proxy

Use a trusted certificate for your real hostname on nginx, Caddy or your hosting provider's load balancer. Set:

```dotenv
APP_URL=https://your-domain.example
TRUST_PROXY=true
ENABLE_HSTS=true
DATABASE_PROVIDER=sqlite
```

Start the base configuration with `docker compose up --build -d` and proxy to `127.0.0.1:3000`. The base configuration binds the application's host port to loopback. A proxy on another host needs a deliberately configured private-network connection; do not expose the raw Node port publicly.

The proxy must overwrite `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto` and the forwarded client IP. Use the original public host, `https` as the protocol and the real client address. Do not trust client-supplied forwarding headers. Production admin access requires `TRUST_PROXY=true` behind that controlled TLS terminator. With `TRUST_PROXY=false`, production authentication is disabled. The standalone Next.js backend serves HTTP; never expose its raw port to untrusted clients who could forge forwarded headers.

### Existing Docker volumes

New volumes inherit `/data` ownership from the image. Old volumes created by the previous root-running image may be owned by root. Back up the database, stop the service, and perform a one-time ownership correction on the application's named volume:

```bash
docker compose stop hashfork-list
docker compose run --rm --no-deps --user root hashfork-list \
  sh -c 'chown -R node:node /data'
docker compose up -d
```

This helper changes only the mounted `/data` application volume; normal startup remains non-root. Do not use it against unrelated mounts.

## Vercel and Supabase

1. Create a Supabase project and apply `supabase/migrations/202610050001_hashfork.sql` before sending app traffic to it. Paste the SQL into the Supabase SQL editor, or set DATABASE_URL in an ignored local .env and run `node --env-file=.env scripts/migrate-supabase.mjs` using a migration connection. Take a database backup before updating an existing deployment.
2. Import the repository into Vercel using the Next.js preset. The committed `vercel.json` automatically selects `npm ci --ignore-scripts` for installation and `npm run build` for the build.
3. Select the Node.js runtime, preferably Node 24. Native SQLite and Argon2 packages require Node; do not move the backend to the Edge runtime. [Vercel's supported Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) include Node 24.
4. Set the server-only variables below for the intended deployment environment.
5. Deploy, run the checks below, and complete first-login setup at the deployed `/admin`.

| Variable | Production value |
| --- | --- |
| `DATABASE_PROVIDER` | `supabase` |
| `DATABASE_URL` | Supabase Postgres transaction-pooler connection string |
| `ADMIN_SETUP_TOKEN` | Independent random setup secret, at least 32 characters |
| `AUTH_ENCRYPTION_KEY` | Base64 encoding of 32 random bytes |
| `AUTH_SESSION_MINUTES` | `60`, or your chosen session lifetime |
| `APP_URL` | Exact public HTTPS origin, such as `https://your-domain.example` |
| `TRUST_PROXY` | `true` |
| `ENABLE_HSTS` | `true` after validating the production domain's HTTPS |

Copy the **Transaction pooler** URL from Supabase's Connect dialog, normally on port `6543`; do not guess its hostname. URL-encode any special characters in the database password. The connection verifies TLS. If needed, set `DATABASE_CA_CERT` to a file containing the trusted database root CA; never disable TLS verification in production. The pg adapter limits each warm process to one connection and uses unnamed parameterized queries. Each warm Vercel instance has its own one-connection pool; monitor total database connection capacity as traffic scales. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)

Supabase Auth is not used for this app's single admin. Supabase supplies the Postgres database. Keep authentication records in private database tables and grant no browser/anonymous access to them. The frontend calls this app's API; it does not need a Supabase publishable key.

Vercel terminates public TLS. Do not upload the localhost certificate or private key to Vercel. SQLite is not an acceptable persistent backend there; the serverless filesystem must not hold the database, sessions or rate limits.

Use separate databases and independent auth secrets for Preview and Production. A preview connected to the production database can change production content and its login state. Use the preview's actual `APP_URL` and confirm its TLS/origin configuration.

### Schema changes and backups

Apply migrations before deploying code that needs a new schema. Keep migration credentials server-side and restrict the database application role to the project's schema where practical. Database backups contain authentication state, so protect them and store the encryption key separately.

The app's JSON export transfers categories and resources between SQLite and Supabase. It does not migrate passwords, sessions or MFA. For a complete disaster-recovery restore, restore the database and its matching `AUTH_ENCRYPTION_KEY`.

## Checks before calling a deployment ready

- `/api/health` returns 200; the public list and assets load.
- First-login setup rejects a wrong setup token and can initialize only once.
- Sign-in works; refreshing requires sign-in again; logout invalidates the old token.
- Anonymous mutations/import/export fail; authenticated content editing and backup export succeed.
- Optional 2FA enrollment is confirmed by a working code; password-only sign-in is then rejected; recovery codes work once.
- Responses and browser storage contain no session cookies or persisted bearer tokens.
- A restart/redeploy preserves content, admin state, sessions and rate-limit state in the selected database.
- Supabase-backed deployments have their migration applied and reachable TLS database connection.
- Production has a trusted HTTPS certificate, correct origin and a proxy that overwrites forwarded headers.

The presence of configuration files is not proof of a live deployment. A local Docker build does not verify a real Supabase project's schema, permissions, network access or Vercel environment variables.
