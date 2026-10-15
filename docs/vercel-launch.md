# The HashFork List: recorded Vercel launch

This is a historical setup record, not a verification of the current production deployment. Follow the [deployment guide](deployment.md#vercel-and-supabase) when deploying the current app.

Recorded configuration:

- Vercel team: BDPERSO (`bdperso`); project: `the-hashfork-list`.
- Production origin: <https://the-list.hashfork.tech>.
- Function region: Paris (`cdg1`); runtime: Node.js 24.
- Supabase project: `fsnysbsbqtdlaecggxia`.

## Recorded Supabase setup

The Vercel marketplace resource `supabase-cobalt-leaf` was connected to Production. Its managed Transaction pooler connection was copied privately to the server-only `DATABASE_URL` secret. The initial migration was applied to the previously empty project.

The six app tables were checked for RLS and absence of browser/anonymous privileges. The app uses its own admin authentication and a server-side PostgreSQL connection.

The public Supabase Root 2021 CA is bundled as `deploy/supabase-ca.txt` and included in every server function by `next.config.mjs`. Configure `DATABASE_CA_CERT=./deploy/supabase-ca.txt` to use it with TLS certificate verification enabled. A PostgreSQL query using this connection and CA passed during the recorded launch.

Certificate source: [Supabase Root 2021 CA](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt).

Certificate SHA-256: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

If the database password changes, refresh the Vercel integration credentials and the `DATABASE_URL` copy before redeploying. Only Production was connected in this record; check current settings before configuring another environment.

## Before deploying the current app

Apply **all** files in `supabase/migrations/` in filename order, including the GitHub stars migration. The original launch's initial schema alone is insufficient for the current app. Back up the database before applying migrations.

With the migration connection configured in an ignored local environment file:

```sh
node --env-file=.env.local scripts/migrate-supabase.mjs
```

The migrations preserve existing authentication state. Existing resources have blank GitHub counts until edited; personal ratings are not converted. Set counts manually in the resource editor. The admin Categories section now uses a dropdown with Rename and Delete actions for the selected category.

## Recorded OVH subdomain configuration

The recorded DNS entry was a CNAME for `the-list.hashfork.tech` pointing to `5226bc62a697938c.vercel-dns-017.com.`. Vercel had the subdomain attached and verified during the recorded launch.

Before changing DNS, check the current target in Vercel **Settings → Domains**. In the [OVH manager](https://www.ovh.com/manager/), open **Web Cloud → Domain names → hashfork.tech → DNS zone** and review existing records for `the-list`. A CNAME cannot coexist with another record at the same name. Use the target Vercel currently requests, then verify the domain in Vercel after propagation.

## First admin login

After deployment and database setup, open [the admin page](https://the-list.hashfork.tech/admin). If no admin exists yet, enter the deployment's `ADMIN_SETUP_TOKEN` and choose a password. Setup closes once the admin is created; an existing admin signs in with their password and optional authenticator code.

The setup token and `AUTH_ENCRYPTION_KEY` were configured in Vercel Production. Preserve the encryption key securely for restores and optional 2FA. Keep local environment files private and ignored; they may also contain deployment access tokens.

## Deployment commands

From the project directory with your authenticated Vercel CLI, after applying migrations and checking Production environment variables:

```sh
vercel deploy --prod --yes --no-wait --scope bdperso
vercel domains verify the-list.hashfork.tech --scope bdperso
```

The recorded source upload used the CLI; Git automatic deployments were not connected. Check the current integration before assuming that a Git push deploys the app.

## Recorded deployment state

Deployment `dpl_8TnDUwSTUdXwi13AbhVCvtVLX4sW` reached READY in `cdg1`. The domain and PostgreSQL TLS/schema query passed verification at that time. Browser and admin sign-in verification were still pending in that record.

This record does not establish that the latest commit is deployed or that later migrations have been applied. Use the [deployment verification checks](deployment.md#checks-before-calling-a-deployment-ready) for the current release.
