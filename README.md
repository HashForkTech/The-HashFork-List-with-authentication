# The HashFork List

A minimalist, dark-themed directory of curated resources: GitHub applications, LLMs, models and AI tools,  with an English public interface and a simple admin area.

> **Stack** Next.js (App Router) · TypeScript · React · Tailwind CSS · SQLite (local file)
>
> **This build has NO admin password and NO translation widget**. No accounts, no passwords, no cookies, therefore **no SSL/TLS certificate is required** to run it.

<img width="721" height="342" alt="image" src="https://github.com/user-attachments/assets/366aa137-2c7e-4731-9933-77d64ef98f4e" /> 
<img width="714" height="330" alt="image" src="https://github.com/user-attachments/assets/66fdde40-cc2c-4182-970b-59512162ce14" />
<img width="722" height="1059" alt="image" src="https://github.com/user-attachments/assets/ac277ed5-a2f0-46a8-81c3-6f5716ca1a48" />

---

## Table of contents

1. [Quick start](#quick-start)
2. [Scripts](#scripts)
3. [Environment variables](#environment-variables)
4. [Data storage](#data-storage)
5. [Admin area (no password)](#admin-area-no-password)
6. [Backup & restore](#backup--restore)
7. [Database migrations & initialization](#database-migrations/initialization)
8. [Security notes](#security-notes)
9. [Deployment](#deployment)
10. [Project structure](#project-structure)
11. [Testing](#testing)
12. [Troubleshooting](#troubleshooting)

---

## Quick start

Requirements: **Node.js ≥ 24** and npm.

```bash
npm install          # installs Next.js, better-sqlite3, …
cp .env.example .env # optional. Everything has sensible defaults
npm run dev          # http://localhost:3000
```

Open <http://localhost:3000> for the public list and <http://localhost:3000/admin> to manage it (no login screen. The dashboard opens directly).

Production build:

```bash
npm run build
npm run start        # serves the production build on PORT (default 3000)
```

## Scripts

| Command             | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Development server with hot reload                    |
| `npm run build`     | Production build (also emits `.next/standalone`)      |
| `npm run start`     | Serve the production build                            |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`)                     |
| `npm test`          | Run the test suite (Vitest)                           |
| `npm run test:watch`| Run tests in watch mode                               |

## Environment variables

All optional.There is **no secret to configure** (no passwords, no sessions). Copy `.env.example` to `.env` only to override defaults.

| Variable            | Default                 | Description                                                                 |
| ------------------- | ----------------------- | --------------------------------------------------------------------------- |
| `DATA_DIR`          | `./data`                | Directory holding the SQLite database. **Must be a persistent volume in production.** |
| `DATABASE_FILE`     | `hashfork.sqlite`       | Database file name inside `DATA_DIR`.                                        |
| `APP_URL`           | `http://localhost:3000` | Public origin (metadata base URL + host allow-list for write requests).     |
| `TRUST_PROXY`       | `true`                  | Trust `X-Forwarded-For` / `X-Forwarded-Host` (set `false` when not behind a proxy). |
| `ENABLE_HSTS`       | `false`                 | Send `Strict-Transport-Security`. Enable **only** when serving over HTTPS. |

## Data storage

Everything lives in **one local SQLite database**. No external database service (no Supabase, Firebase, MongoDB Atlas, hosted SQL, Airtable, Notion …). Browser `localStorage` is never used as a database.

```
data/                       ← DATA_DIR (back this up)
  hashfork.sqlite           ← the database (WAL mode)
  hashfork.sqlite-wal       ← write-ahead log (transient)
  hashfork.sqlite-shm       ← shared-memory index (transient)
```

Tables: `categories`, `items`, `settings` (key/value, e.g. the main page title). (Migration v2 also drops the auth tables of earlier builds.)

All reads/writes go through a repository layer (`lib/db/repositories/*`). React components and route handlers never touch SQLite directly, so migrating later to PostgreSQL or another database means re-implementing those repositories only.

**Data survives server restarts** as long as `DATA_DIR` is on persistent storage.

## Admin area (no password)

`/admin` is the full content-management screen (main page title, categories, resources, backup tools). It opens **without any login**. There is no password, no account and no session cookie. That is exactly why **no SSL certificate is required**: the app never stores or transmits credentials.

The **Resources** section carries the same filter bar as the public list (category, Tested / Non-tested and substring search — all combined). Editing is protected against accidental loss: closing or switching away from a category/resource form that holds unsaved changes opens a dialog offering **Save**, **Discard changes** or **Keep editing** (changes are compared with the saved values, so edits that were typed and then reverted never warn). A native browser prompt guards closing the tab or reloading.

> ⚠️ **Know what this means.** Anyone who can reach `/admin` (and the `/api/*` write endpoints) can change your content. That is fine on a private machine, a LAN tool or behind a protective reverse proxy. It is **not** fine on an unauthenticated public URL. If the instance is exposed to people you don't trust, gate it at the server layer before it reaches Node:
>
> - **nginx / Caddy basic auth** on `/admin` and `/api` (the public list at `/` stays open);
> - an **IP allow-list** or VPN-only binding (`127.0.0.1:3000` behind the proxy);
> - a network-level gate (Tailscale, Cloudflare Access, firewall rule).
>
> Example (nginx):
> ```nginx
> location ~ ^/(admin|api) {
>     auth_basic "Administration";
>     auth_basic_user_file /etc/nginx/.htpasswd;
>     proxy_pass http://127.0.0.1:3000;
> }
> location / {
>     proxy_pass http://127.0.0.1:3000;
> }
> ```

The app itself still protects its write endpoints against **cross-origin "drive-by" requests** (a malicious web page running in a visitor's browser): mutations must carry a custom `x-requested-with: hashfork-admin` header and pass an `Origin` host check (see `lib/http/csrf.ts`).

## Backup & restore

Because the data is local, back it up deliberately.

### Option A. Export / Import (built in, recommended)

In **Admin → Data & backup**:

- **Export data (JSON)** downloads `hashfork-list-backup-YYYY-MM-DD.json`:

  ```json
  {
    "format": "the-hashfork-list/backup",
    "version": 3,
    "exportedAt": "…",
    "categories": [ … ],
    "items": [ … ]
  }
  ```

- **Import** restores such a file (validated entirely before writing, applied in one transaction):
  - *Merge*  adds missing entries, never overwrites existing ones (duplicates are skipped).
  - *Replace all*  deletes current categories/items first and therefore **requires explicit confirmation** in a dialog *and* `confirm: true` in the request.

### Option B. Copy the database file

```bash
# backup (consistent snapshot, even while running)
sqlite3 data/hashfork.sqlite ".backup 'backup-$(date +%F).sqlite'"
# or simply copy the file while the app is stopped
cp data/hashfork.sqlite backup.sqlite

# restore
cp backup.sqlite data/hashfork.sqlite   # app stopped
```

## Database migrations & initialization

`lib/db/schema.ts` holds an ordered list of SQL migrations. On every connection, `migrate(db)` compares the SQLite `user_version` pragma with the migration list and runs each pending migration exactly once, inside a transaction. A brand-new database is created and migrated automatically on first request — there is no separate install step.

Adding a schema change = append a new `{ version: n, sql: … }` entry; existing databases upgrade on next start.

## Security notes

- **No credentials at all**. No password hashing, no sessions, no cookies, no `Secure`-cookie/HTTPS constraint. TLS is optional (still recommended on public networks for privacy).
- **Cross-origin request protection** . Writes require a custom `x-requested-with: hashfork-admin` header (cross-site forms can't set it; cross-site `fetch` triggers a never-granted preflight), pass an `Origin` host allow-list check, and reject `Sec-Fetch-Site: cross-site`. This keeps third-party web pages from mutating your data through a visitor's browser.
- **Input validation**. Zod schemas server-side (`lib/validation/schemas.ts`) for every payload; URLs must be `http(s)` (`javascript:`, `data:` … rejected), are length-capped and normalized (missing scheme → `https://`).
- **XSS** — item names/descriptions are rendered as plain text by React (auto-escaped); never as raw HTML.
- **Security headers** (`middleware.ts`). Strict self-contained `Content-Security-Policy` (no third-party origins at all), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, optional HSTS. `upgrade-insecure-requests` is deliberately **not** set so plain-HTTP deployments keep working.
- **Error handling**. User-facing English messages, no stack traces/SQL leaked; details are logged server-side.
- **Rate limiting**. None is required (there is no login to brute-force). If you expose the write API publicly, do the rate limiting at the reverse proxy.

## Deployment

**The critical requirement: `DATA_DIR` must live on persistent storage.** The app is a single Node.js process plus a SQLite file. No TLS certificate is needed for the app to function.

```
Browser → Next.js app (UI · API routes) → SQLite (categories · items)
```

### Node.js server / VPS (recommended)

```bash
npm ci --ignore-scripts   # no package build scripts are required (see Troubleshooting)
npm run build
DATA_DIR=/var/lib/hashfork APP_URL=http://your.host npm run start
```

Run it under systemd / pm2 / Docker. A TLS-terminating proxy (Caddy, nginx) is optional; if you add one and want HSTS, set `ENABLE_HSTS=true`. To keep `/admin` private, add basic auth or an allow-list for `/admin` + `/api` in that proxy (see [Admin area (no password)](#admin-area-no-password)).

### Docker (persistent volume included)

```bash
docker compose up --build -d     # data lives in the named volume "hashfork-data"
```

See `Dockerfile` and `docker-compose.yml`. The volume is what makes the database durable, without it the data disappears with the container.

The runtime image runs Next.js' **standalone server** (`node server.js` on `.next/standalone`, produced by `output: 'standalone'` in `next.config.mjs`) and copies `.next/static` + `public` into it, since the standalone bundle ships without assets. Do **not** change the container command to `npm run start`: `next start` does not work with a standalone build and will crash-loop the container.

### Platform warnings (read this)

| Platform | Persistent local disk? | What to do |
| -------- | ---------------------- | ---------- |
| VPS / dedicated server | Yes | Point `DATA_DIR` at a durable path. |
| Fly.io | Volumes | Create a volume (`fly volumes create hashfork_data`) and mount it at the `DATA_DIR` path. |
| Railway / Render | Volumes | Attach a persistent volume and set `DATA_DIR` to its mount path. |
| AWS ECS / Fargate, Cloud Run | Only with mounted EFS/EBS | Attach persistent storage or the file system is ephemeral. |
| **Vercel / Netlify (serverless)** | **No** | The file system is **ephemeral**: SQLite is not durable there. Use a persistent VM/container (or add a PostgreSQL repository implementation. The repository layer exists for exactly this). |

Do **not** assume a local SQLite file is persistent on an ephemeral file system. If your platform has no persistent volume, the data will be lost on redeploy. That is a platform property, not something the app can fix.

## Project structure

```
app/
  page.tsx                 # public homepage (server-rendered)
  layout.tsx, globals.css  # English metadata, dark theme
  admin/page.tsx           # administration dashboard (no login)
  admin/dashboard/page.tsx # redirect → /admin (kept for old links)
  api/…                    # REST API (categories, items, export, import)
components/
  Header.tsx, Directory.tsx, ItemRow.tsx, LinkIcons.tsx
  ResourceFilters.tsx      # shared filter bar (category / Tested / search)
  DescriptionText.tsx      # two-line description + full-text hover tooltip
  admin/                   # AdminDashboard, ItemForm, ConfirmDialog,
                           # UnsavedChangesDialog, DataTools, AdminLayout
lib/
  db/                      # SQLite client, schema migrations, error helpers
  db/repositories/         # categories, items (data-access layer)
  http/                    # api helpers, cross-origin mutation guard
  validation/              # Zod schemas + URL normalization
  filtering.ts             # shared category / status / substring-search filter
  unsaved.ts               # unsaved-changes (form draft) comparison helpers
  services/backup.ts       # export / import logic
  api/admin-client.ts      # typed fetch client used by the admin UI
middleware.ts              # security headers + CSP
tests/                     # Vitest suite (unit + jsdom UI tests)
data/                      # SQLite database (created at runtime, git-ignored)
```

## Testing

```bash
npm test          # 130 tests across 10 files
```

Coverage includes: item CRUD with full/partial/empty payloads, URL validation & normalization, the “Tested” check date (stamped when the checkbox is checked, kept across edits, cleared when unchecked), category CRUD, **category deletion keeping its items**, category filtering, site settings (default + customized main page title, validation), cross-origin protection (missing header / cross-site origin / Sec-Fetch-Site / malformed Origin), "mutations need no credentials" and "auth endpoints + auth tables are gone", malformed & oversized input, and backup export/import (merge, replace-with-confirmation, malformed files).

The newer behaviour is covered as well:

- **Shared filtering** (`tests/filtering.test.ts`). Case-insensitive substring search over name/description/comment, category + Tested/Non-tested + search combinations, empty queries, resources without a category.
- **Unsaved-changes detection** (`tests/unsaved.test.ts`). Draft normalization (trimmed text, normalized URLs, clamped rating), reverted edits staying clean, inline "new category" handling, category/title name comparison.
- **Public list UI** (`tests/ui-directory.test.tsx`, jsdom).Search field placement next to *Non-tested*, filter combinations with live typing, no-match state, two-line description clamping, full description on hover and keyboard focus, empty descriptions.
- **Admin UI** (`tests/ui-admin.test.tsx`, jsdom). The same filter combinations on the dashboard, and the unsaved-changes guard: normal leave without edits, the Save / Discard changes / Keep editing dialog, saving before switching to another resource, reverted edits not warning, category rename protection, and the navigation guard.


## Troubleshooting

- **I want the admin area protected**. Put basic auth / an IP allow-list / a VPN gate in front of `/admin` and `/api` at the reverse proxy (see [Admin area (no password)](#admin-area-no-password)). The app intentionally ships without a login.
- **`better-sqlite3` fails to install**. It ships prebuilt native binaries in its `prebuilds/` directory (e.g. `prebuilds/linux-x64.node`), but npm may still invoke `node-gyp` on it (it contains a `binding.gyp`), which fails on machines without a C++ toolchain, without a writable `~/.cache`, or without access to Node headers. Safe remedy: `npm ci --ignore-scripts` — no dependency lifecycle script is actually required (then verify with `npm test` and `npm run build`). When scripts do run, npm ≥ 11.19 must be allowed to run them: the project declares the policy in `package.json#allowScripts`.
- **`SQLITE_CANTOPEN`**. `DATA_DIR` is not writable; point it at a writable, persistent path.
- **Lost data after a redeploy**. Your platform's file system is ephemeral; see [Deployment](#deployment).
