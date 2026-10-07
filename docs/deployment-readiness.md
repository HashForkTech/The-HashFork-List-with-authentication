# Deployment readiness — 5 October 2026

The application is prepared for **Docker with persistent SQLite** and **Vercel with Supabase Postgres**. Docker was exercised locally. A hosted Vercel/Supabase deployment was not performed because no cloud project or credentials were supplied.

## Verified

| Check | Result |
| --- | --- |
| Project verification | Typecheck, production build and 188 tests passed; 5 PostgreSQL integration tests passed separately. |
| Dependency audit | Production npm audit reports zero known vulnerabilities. |
| Docker production build | Node 24 Linux x64 image builds; SQLite and Argon2 native modules load. Runtime uses UID 1000. |
| HTTPS authentication | 31 production smoke checks passed: one-time setup, password login, protected edits/export, TOTP, recovery, replay/reuse rejection and logout. |
| Cookie and CSP checks | No checked response set a cookie. Public/admin HTML uses matching script nonces; script CSP excludes unsafe-inline. CSS and JavaScript assets load. |
| Transport checks | Plain HTTP auth is rejected. Forged HTTPS forwarding headers are rejected with TRUST_PROXY=false. |
| Persistence | 5 checks passed after replacing the container: admin, content and active bearer session survive; logout invalidates that session. |
| Supabase/Vercel environment-profile build | Next.js production build passes without a reachable database or build-time auth secrets; the Linux Argon2 native binary is traced and no environment/certificate/private-key files are traced. |
| PostgreSQL migration | Supplied migration CLI applied successfully to disposable PostgreSQL 17; adapter integration tests passed with the pg driver. |
| Test certificate | Self-signed localhost certificate generated, verified and ignored by Git/Docker. SAN includes localhost, 127.0.0.1 and ::1. |

## Configure before deployment

Generate independent secrets; no admin password belongs in the environment:

```bash
cp .env.example .env
openssl rand -hex 32       # paste as ADMIN_SETUP_TOKEN
openssl rand -base64 32    # paste as AUTH_ENCRYPTION_KEY
```

For local HTTPS testing:

```bash
npm ci --ignore-scripts
npm run dev:https          # https://localhost:3000/admin
```

For the Docker HTTPS test:

```bash
npm run certs:generate
docker compose -f docker-compose.yml -f docker-compose.https.yml up --build -d
# https://localhost:8443/admin
```

At the first admin visit, enter the setup token and choose a password of 15–128 characters. Keep the encryption key for future database restores and store optional 2FA recovery codes outside the app.

For Vercel, set DATABASE_PROVIDER=supabase, the server-only Supabase Transaction pooler DATABASE_URL, both auth secrets, the correct HTTPS APP_URL and TRUST_PROXY=true. Apply `supabase/migrations/202610050001_hashfork.sql` via the SQL editor or:

```bash
node --env-file=.env scripts/migrate-supabase.mjs
```

The committed `vercel.json` selects `npm ci --ignore-scripts` and `npm run build`. Use Node 24 and separate preview/production databases and secrets. Actual hosted schema, database TLS/network access and Vercel configuration still require verification.

Production Docker needs a controlled TLS proxy with a trusted certificate, TRUST_PROXY=true and a private raw Node port. Its /data volume must persist; old root-owned volumes may need the documented ownership correction.

On this Windows host, Docker Desktop's Ubuntu integration was unavailable for UNC bind mounts. HTTPS container testing used temporary Windows copies of the test certificate/config. Enable WSL integration or run Compose from a supported local/Linux filesystem before using the repository's TLS overlay here.

See [the deployment guide](deployment.md) for complete setup, backup, TLS and verification instructions.
