# The HashFork List

A directory of curated resources: GitHub projects, LLMs, models and AI tools. It comes with a clean public list and a protected admin screen. Run it with SQLite on your own Node.js server or Docker, or with Supabase Postgres on Vercel.

**Looking for local deployment without authentication?** The same app is also available without authentication for local deployment: [The HashFork List — without authentication](https://the-list.hashfork.tech/).

**Customize your list name:** Open `/admin`, change **Page title** under **Main page**, and click **Save**.

**Stack:** Next.js (App Router) · TypeScript · React · Tailwind CSS · SQLite / Supabase Postgres

**Admin access requires a password created during first-login setup, with optional authenticator-app 2FA.** The app saves only a salted Argon2id password verifier and uses bearer sessions held in browser memory. It creates no cookies. Serve production admin access over HTTPS.

![The public list: a filter bar with a category menu, Tested and Non-tested checkboxes, a search field and a sort menu, above resource rows that each show a name, an added date, a category chip, link icons, a tested date, a five slot star rating, a Comment button and a two line description](docs/screenshots/public-list.png)

---

## What you get

**Public list** (`/`)

- Resources grouped by category, each with a name, description, links, a category chip and review metadata.
- Links are shown as icons: GitHub, website, Hugging Face, YouTube.
- A "Tested" badge with the date it was checked, a star rating from 0 to 5 (drawn on a 5-slot scale), and an optional comment behind a "Comment" button (tap- and keyboard-friendly).
- Filter bar: category, Tested / Non-tested, and a case-insensitive search over name, description and comment. All three combine, and a sort control orders the list by newest, name or rating.
- A live result count ("12 of 31 resources") sits under the filter bar with a "Reset filters" shortcut. Filters and sort are mirrored into the URL query string (`/?category=…&tested=0&q=…&sort=rating`), so a view can be bookmarked, shared, and restored after a refresh.
- Press `/` anywhere to jump to the search field; `Esc` clears it.
- Descriptions are clamped to two lines; clicking/tapping, hovering or keyboard-focus reveals the full text in a popover.

**Admin area** (`/admin`)

- Change the list name (main page title), manage categories and resources, and export or import data.
- Same filter bar as the public list.
- Forms refuse to close with unsaved changes: you get **Save / Discard changes / Keep editing**.
- Deleting a category keeps its resources (they simply become uncategorized).

**Design choices**

- No public registration or multiple admin accounts. First-login setup is protected by a deployment setup secret.
- Docker and local Node hosting work without an external service. Vercel uses Supabase Postgres for durable storage.
- No third-party scripts, fonts or analytics; the Content-Security-Policy allow-lists nothing outside the app itself. The Inter typeface is self-hosted (bundled from `@fontsource-variable/inter` at build time, served from the same origin).

---

## Table of contents

1. [Quick start](#quick-start)
2. [Screenshots](#screenshots)
3. [Scripts](#scripts)
4. [Environment variables](#environment-variables)
5. [How the data is stored](#how-the-data-is-stored)
6. [Using the admin area](#using-the-admin-area)
7. [Backup and restore](#backup-and-restore)
8. [Schema migrations](#schema-migrations)
9. [Security model](#security-model)
10. [Deployment](#deployment)
11. [Project structure](#project-structure)
12. [Testing](#testing)
13. [Troubleshooting](#troubleshooting)

---

## Screenshots

Every image below comes from a production build (`npm run build` then `npm run start`) running against a demo database with 17 resources in 5 categories. The image at the top of this file is the default public view.

### Public list

Filters and sort mirrored into the URL (`/?category=inference-engines&sort=rating`), with the live result count, the "Reset filters" shortcut, and an open comment popover.

![The public list filtered to the Inference Engines category and sorted by best rated, showing "4 of 17 resources", a "Reset filters" link, category chips, star ratings, and an open comment popover under the first row](docs/screenshots/public-list-filters.png)

The same list on a phone-sized viewport (390 px wide): the filter bar wraps to two rows and every resource stacks its metadata under the title.

![The public list on a 390 pixel wide viewport, with a two row filter bar above stacked resource rows](docs/screenshots/public-list-mobile.png)

### Admin area

The dashboard at `/admin`: the main page title and the category list with its per-category resource counts.

![The admin dashboard: header with an ADMIN badge and a View site link, a page title field with a Save button, and a category list where every row shows the name, the number of resources, and Rename and Delete buttons](docs/screenshots/admin-dashboard.png)

The Resources section, which carries the same filter bar as the public list.

![The admin Resources section: filter bar with category menu, Tested and Non-tested checkboxes, search field and an Add a resource button, above resource cards with category chips, a Tested badge, star ratings, the comment text, and Edit and Delete buttons](docs/screenshots/admin-resources.png)

The resource editor for a single entry: category, name, description, the four link fields, the star rating, the Tested checkbox with its stored check date, and the comment.

![The admin resource editor filled in for Home Assistant: category set to Home Automation, name, description, website, GitHub and YouTube links, five filled stars, a checked Tested box showing "Last checked on 2026-10-03", a comment, and Save and Cancel buttons](docs/screenshots/admin-resource-editor.png)

---

## Quick start

You need **Node.js 22.22.2 or newer** and **OpenSSL** for local HTTPS certificates. The Docker image uses Node 24.

```bash
npm ci --ignore-scripts
cp .env.example .env
# Generate independent values and paste them into .env:
openssl rand -hex 32       # ADMIN_SETUP_TOKEN
openssl rand -base64 32    # AUTH_ENCRYPTION_KEY
npm run dev:https         # https://localhost:3000
```

The HTTPS launcher generates the ignored localhost certificate if it is missing. It is self-signed: accept it only for this local test or trust its public certificate in your local browser. The private key stays in `certificates/`.

Then open:

- <https://localhost:3000> for the public list
- <https://localhost:3000/admin> to create the admin password using your one-time setup token

The setup token is not the admin password. After setup, sign in with the password you chose. The app does not save or log the password and uses no cookies.

`npm run dev` remains available for plain-HTTP development. Use HTTPS to test authentication as it will run in production.

For production hosting, follow [Deployment](#deployment) and [the detailed deployment guide](docs/deployment.md).


## Scripts

| Command                | What it does                                       |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Plain-HTTP development server with hot reload      |
| `npm run dev:https`    | Local HTTPS development with self-signed certificates |
| `npm run certs:generate` | Generate ignored localhost certificate / private key |
| `npm run build`        | Production build (also emits `.next/standalone`)   |
| `npm run start`        | Serve the production build                         |
| `npm run typecheck`    | Type check only (`tsc --noEmit`)                   |
| `npm test`             | Run the test suite once (Vitest)                   |
| `npm run test:watch`   | Run tests in watch mode                            |

## Environment variables

Copy `.env.example` to `.env` for local hosting. Configure the same values as server-side environment variables on Vercel. The admin password is created in the setup screen and never belongs in an environment variable.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_PROVIDER` | `sqlite` | `sqlite` for local/Docker storage; `supabase` for Supabase Postgres. |
| `DATABASE_URL` | none | Required for Supabase; server-only Postgres connection string. |
| `DATABASE_CA_CERT` | none | Optional file containing the trusted database root CA for TLS verification. |
| `DATA_DIR` | `./data` | SQLite directory; requires persistent storage in production. |
| `DATABASE_FILE` | `hashfork.sqlite` | SQLite filename inside `DATA_DIR`. |
| `ADMIN_SETUP_TOKEN` | none | Random first-login setup secret, at least 32 characters. Setup closes after the first password is created. |
| `AUTH_ENCRYPTION_KEY` | none | Required base64-encoded 32-byte random key for setup and TOTP encryption. Keep it with your deployment secrets and preserve it for database restores. |
| `AUTH_SESSION_MINUTES` | `60` | Maximum admin session lifetime in minutes. |
| `APP_URL` | `http://localhost:3000` | Public origin; use your actual HTTPS URL in production. |
| `TRUST_PROXY` | see `.env.example` | Required for production admin access; enable only behind a controlled HTTPS proxy that overwrites forwarded IP/host/protocol headers. |
| `ENABLE_HSTS` | `false` | Enable after configuring a trusted production HTTPS certificate; keep disabled for self-signed localhost tests. |

No auth or database secret may have a `NEXT_PUBLIC_` prefix. Session tokens are held only in browser memory; refreshing or reopening the page requires sign-in.


## How the data is stored

Choose one backend with `DATABASE_PROVIDER`:

- **SQLite:** a local database in `DATA_DIR`, used by default and by Docker. The database and its WAL files live on durable storage.
- **Supabase:** hosted Postgres via a server-only `DATABASE_URL`, used for Vercel. The browser talks to this app's protected API; it does not connect directly to the Supabase database.

```
data/                      <- DATA_DIR for SQLite; back up this directory
  hashfork.sqlite
  hashfork.sqlite-wal
  hashfork.sqlite-shm
```

Content lives in `categories`, `items` and `settings`. Authentication adds the admin password verifier, encrypted MFA state, hashed recovery codes, hashed session tokens and durable rate-limit state. These records are private; content JSON exports do not transfer login credentials.

Earlier migration v2 removed the old authentication tables. The new authentication migration creates fresh state, so upgrading from that build requires first-login setup.

Repository functions isolate the storage backend from React components and route handlers. See [the deployment guide](docs/deployment.md) for Supabase setup and migration instructions.


## Using the admin area

On the first visit to `/admin`, enter the deployment's `ADMIN_SETUP_TOKEN` and choose a strong password. The server atomically creates one admin and closes setup. Later visits require that password.

Authentication uses a random bearer session sent in the `Authorization` header, held only in memory. The app sets no cookies and does not keep the token in browser storage. Reloading the page or ending the session requires sign-in again.

The admin can enable optional TOTP 2FA with an authenticator app. Scan the setup QR code and confirm a generated code before activation. Keep the one-time recovery codes somewhere safe outside the app. Once enabled, login also requires a code; changing or disabling 2FA requires confirmation.

The content-management screen contains the main page title, categories, resources and backup tools. Two behaviours worth knowing:

- **Filtering.** The Resources section carries the same filter bar as the public list: category, Tested / Non-tested, and substring search, all combinable.
- **Nothing is lost by accident.** Closing a category or resource form, switching to another resource, or navigating away while the form differs from what is saved opens a dialog: **Save**, **Discard changes** or **Keep editing**. The comparison is against the saved values, so typing something and then reverting it never warns you. A native browser prompt guards a tab close or reload.

Admin API authorization is enforced on the server. Cross-origin request checks provide an additional protection layer. Use HTTPS for production to protect passwords, setup secrets, MFA codes and bearer tokens in transit.


## Backup and restore

Export content regularly and back up your chosen database. Full database backups also contain authentication state; keep the matching encryption key separately.

### Option A: Export / Import (built in, recommended)

In **Admin → Data & backup**:

**Export data (JSON)** downloads `hashfork-list-backup-YYYY-MM-DD.json`:

```json
{
  "format": "the-hashfork-list/backup",
  "version": 3,
  "exportedAt": "2026-01-01T12:00:00.000Z",
  "categories": [],
  "items": []
}
```

**Import** accepts such a file, in one of two modes. The whole file is validated before anything is written, and the import runs as a single transaction, so a bad file changes nothing.

- **Merge** adds what is missing and never overwrites; existing ids are skipped.
- **Replace all** deletes the current categories and items first. It asks for explicit confirmation in a dialog *and* requires `confirm: true` in the request body.

### Option B: Back up the SQLite database file

```bash
# Backup: a consistent snapshot, safe to run while the app is up
sqlite3 data/hashfork.sqlite ".backup 'backup-$(date +%F).sqlite'"

# Or just copy the file while the app is stopped
cp data/hashfork.sqlite backup.sqlite

# Restore (with the app stopped)
cp backup.sqlite data/hashfork.sqlite
```

## Schema migrations

SQLite migrations run automatically when the local database opens. Each version runs once inside a transaction, including the new authentication schema. Preserve your database volume during upgrades.

Supabase uses `supabase/migrations/202610050001_hashfork.sql`. Apply it with the Supabase SQL editor or `node --env-file=.env scripts/migrate-supabase.mjs` before routing traffic to a new database. Keep migrations and database credentials on the server, and take a database backup before upgrading. See [Supabase deployment](docs/deployment.md#vercel-and-supabase).


## Security model

### What the app protects

| Threat | Protection |
| --- | --- |
| Anonymous editing, imports and exports | Server-side admin bearer-session checks |
| First visitor claiming the admin account | Owner-controlled setup secret and atomic one-time setup |
| Plaintext password exposure from the database | Salted Argon2id password verifier; password never persisted |
| Stolen authenticator database secret | TOTP secret encrypted with a deployment key |
| Reused recovery codes or OTPs | Single-use checks and atomic state changes |
| Login or MFA guessing | Durable authentication rate limits |
| Cross-origin browser mutations | Custom request header, origin and fetch-site checks |
| Unsafe resource HTML / URLs | Zod validation, HTTP(S)-only URLs and React escaping |
| Framing and unwanted external resources | Security headers, same-origin CSP and per-response script nonces |

Production HTML uses a fresh script nonce and omits `unsafe-inline` from the script policy. Bearer tokens remain accessible to the running page's JavaScript. Safe rendering and the Content-Security-Policy matter because an injected script could act as the admin. The session is memory-only and expires; logout and authentication changes invalidate its server record.

The database contains password verifiers and encrypted MFA material, so protect database access and backups. Preserve `AUTH_ENCRYPTION_KEY` separately from the database. Public content exports contain categories and resources, not authentication state.

Production admin requests require HTTPS terminated by a controlled proxy with `TRUST_PROXY=true`; the raw Node backend must stay private. Self-signed certificates provided by the project are for localhost testing only. Production Vercel TLS is managed by Vercel; Docker needs a TLS-terminating proxy with a trusted certificate.


## Deployment

Two supported targets use the same admin authentication and content API:

```
Browser -> HTTPS -> Next.js UI / protected API -> SQLite (Docker / Node)
                                                or Supabase Postgres (Vercel)
```

### Docker

Generate auth secrets in `.env` and a localhost certificate, then start the local HTTPS test configuration:

```bash
npm run certs:generate
docker compose -f docker-compose.yml -f docker-compose.https.yml up --build -d
```

Open <https://localhost:8443/admin>. The container runs as the non-root `node` user and keeps its SQLite database on the named `hashfork-data` volume. The HTTPS overlay uses a self-signed certificate and binds only to localhost. It is a test configuration; production requires a trusted certificate and your real `APP_URL`.

For a production proxy that you already operate, use `docker compose up --build -d`, set `APP_URL=https://your-domain`, and route the proxy to `127.0.0.1:3000`. Enable `TRUST_PROXY=true` only if it overwrites forwarded headers. Set `ENABLE_HSTS=true` after verifying HTTPS.

The image starts the Next.js standalone server (`node server.js`) and includes the static assets. New volumes inherit the correct permissions. Existing volumes from the old root-running container may need the one-time ownership correction in [the deployment guide](docs/deployment.md#existing-docker-volumes).

### Vercel with Supabase

Select Next.js and Node 24 in Vercel. `vercel.json` supplies the installation command `npm ci --ignore-scripts` and the build command `npm run build`. Set `DATABASE_PROVIDER=supabase`, a server-only Supabase transaction-pooler `DATABASE_URL`, the auth secrets, your HTTPS `APP_URL`, and `TRUST_PROXY=true`. Apply the supplied Postgres migration before use.

Do not use SQLite on Vercel: local serverless storage is not the persistent database. Supabase holds content, sessions and authentication state across instances and redeployments. Use separate databases and auth secrets for preview and production deployments.

See [the detailed deployment guide](docs/deployment.md#vercel-and-supabase) for migration, TLS, connection pooling and verification steps.

### Node.js server or VPS

Use a durable SQLite `DATA_DIR`, configure auth secrets and an HTTPS proxy. Build with `npm run build`. For the standalone server:

```bash
cp -R public .next/standalone/
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/
DATA_DIR=/var/lib/hashfork APP_URL=https://your-domain node .next/standalone/server.js
```

Provide the secrets through the process environment or service manager; the standalone server does not automatically load your source checkout's `.env`. Run as a dedicated unprivileged user with write access only to its data/cache directories.

### Deployment verification

`/api/health` checks process liveness and exposes no secrets. It does not prove database connectivity. Before calling a deployment ready, verify public reads, first-login setup, login/2FA, authenticated writes, rejected anonymous writes, backup/export, and persistence after restarting or redeploying.


## Project structure

```
app/
  page.tsx                      Public list, server-rendered
  layout.tsx, globals.css       English metadata, dark theme
  error.tsx, not-found.tsx      Error and 404 boundaries
  opengraph-image.tsx           Social card drawn from the live title and item count
  admin/page.tsx                Admin login, first-login setup and dashboard
  admin/dashboard/page.tsx      Redirect to /admin, kept for old links
  api/                          Auth, health and content / backup REST endpoints
components/
  Header.tsx, Directory.tsx, ItemRow.tsx
  ResourceFilters.tsx           Filter bar shared by public list and admin
  DescriptionText.tsx           Two-line description + full-text tooltip
  CommentButton.tsx             Comment popover button (tap and keyboard friendly)
  SkipLink.tsx                  Keyboard "skip to content" link
  LinkIcons.tsx, BrandIcon.tsx  Per-link icons (GitHub, web, Hugging Face, YouTube)
  admin/                        AdminDashboard, ItemForm, DataTools,
                                ConfirmDialog, UnsavedChangesDialog, AdminLayout
lib/
  types.ts                      Domain types shared by storage, API and UI
  db/                           SQLite / Postgres clients, schema and repositories
  db/repositories/              categories, items, settings (the data-access layer)
  http/                         api response helpers, cross-origin mutation check + guard
  validation/                   Zod schemas, URL normalization
  filtering.ts                  Filter + sort logic and the URL query (de)serialisation
  unsaved.ts                    Form-draft comparison for the unsaved-changes guard
  format.ts, logger.ts          Date formatting, server-side logging
  services/backup.ts            Export and import logic
  api/admin-client.ts           Typed fetch client used by the admin UI
middleware.ts                   Security headers and CSP
tests/                          Vitest suite (unit tests + jsdom UI tests)
docs/screenshots/               Images used in this README
data/                           SQLite database, created at runtime, git-ignored
```

## Testing

```bash
npm test        # unit, security, storage and UI tests
```

What the suite pins down:

- **Data layer.** Item create / update with full, partial and empty payloads; URL validation and normalization; the Tested check date (stamped when the box is checked, kept across unrelated edits, cleared when unchecked); category create and update; deleting a category keeps its items; category filtering; site settings including the default and a customized page title.
- **Security.** Admin mutations require an active bearer session in addition to cross-origin request checks. Authentication coverage includes first-login setup, session expiry and revocation, password verification, MFA and recovery. Badly shaped and oversized input is rejected.
- **Backup.** Export, merge import, replace import with and without confirmation, and malformed backup files.
- **Shared filtering** (`tests/filtering.test.ts`). Case-insensitive substring search over name, description and comment; category + Tested/Non-tested + search combinations; empty queries; resources without a category; URL (de)serialisation of filters and sort, including a query that stays empty for the default view and defaults read back from a malformed query.
- **Unsaved-changes detection** (`tests/unsaved.test.ts`). Draft normalization (trimmed text, normalized URLs, clamped rating); a reverted edit stays clean; inline "new category" handling; name comparison for categories and titles.
- **Public list UI** (`tests/ui-directory.test.tsx`, jsdom). Search field placement next to *Non-tested*, filter combinations while typing, the no-match state, two-line description clamping, full description on hover and keyboard focus, empty descriptions, the tap-friendly comment popover, filters restored from and mirrored back into the query string, re-ordering by name and by rating, the live result count, and `/` focusing the search while `Esc` clears it.
- **Admin UI** (`tests/ui-admin.test.tsx`, jsdom). The filter bar rendered to the right of the *Resources* heading and the same filter combinations on the dashboard, plus the unsaved-changes guard: leaving normally with no edits, the Save / Discard / Keep editing dialog, saving before switching resources, reverted edits not warning, a half-typed new resource protected the same way, category-rename protection, and the navigation guard.

## Troubleshooting

**I want the admin area protected.**
Complete first-login setup using `ADMIN_SETUP_TOKEN`, then sign in with your chosen password. Optional 2FA adds an authenticator code or single-use recovery code. Production authentication requires HTTPS. See [Using the admin area](#using-the-admin-area).

**`better-sqlite3` fails to install.**
Use Node.js 22.22.2 or Node 24 and run `npm ci --ignore-scripts` on the target operating system; do not copy `node_modules` from another platform. This version ships native prebuilt binaries. Skipping install scripts prevents npm from attempting an unnecessary node-gyp rebuild that needs a C++ toolchain and Python. The Docker dependency stage checks that SQLite loads under Node 24 before building the app. After installing, verify with `npm test` and `npm run build`.

**`SQLITE_CANTOPEN`.**
`DATA_DIR` is not writable. Point it at a writable path that also survives restarts.

**My data disappeared after a redeploy.**
Your platform's filesystem is ephemeral; see [Platform warnings](#platform-warnings).

## License

MIT. See [LICENSE](LICENSE).
