# Database

Paperclip uses PostgreSQL via [Drizzle ORM](https://orm.drizzle.team/). There are three ways to run the database, from simplest to most production-ready.

## 1. Embedded PostgreSQL — zero config

If you don't set `DATABASE_URL`, the server automatically starts an embedded PostgreSQL instance and manages a local data directory.

```sh
pnpm dev
```

That's it. On first start the server:

1. Creates a `~/.paperclip/instances/default/db/` directory for storage
2. Ensures the `paperclip` database exists
3. Runs migrations automatically for empty databases
4. Starts serving requests

Data persists across restarts in `~/.paperclip/instances/default/db/`. To reset local dev data, delete that directory.

If you need to apply pending migrations manually, run:

```sh
pnpm db:migrate
```

When `DATABASE_URL` is unset, this command targets the current embedded PostgreSQL instance for your active Paperclip config/instance.

This mode is ideal for local development and one-command installs.

Docker note: the Docker quickstart image also uses embedded PostgreSQL by default. Persist `/paperclip` to keep DB state across container restarts (see `doc/DOCKER.md`).

## 2. Local PostgreSQL (Docker)

For a full PostgreSQL server locally, use the included Docker Compose setup:

```sh
docker compose up -d
```

This starts PostgreSQL 17 on `localhost:5432`. Then set the connection string:

```sh
cp .env.example .env
# .env already contains:
# DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip
```

Run migrations (once the migration generation issue is fixed) or use `drizzle-kit push`:

```sh
DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip \
  npx drizzle-kit push
```

Start the server:

```sh
pnpm dev
```

## 3. Hosted PostgreSQL (Supabase)

For production, use a hosted PostgreSQL provider. [Supabase](https://supabase.com/) is a good option with a free tier.

### Setup

1. Create a project at [database.new](https://database.new)
2. Go to **Project Settings > Database > Connection string**
3. Copy the URI and replace the password placeholder with your database password

### Connection string

Supabase offers two connection modes:

**Direct connection** (port 5432) — use for migrations and one-off scripts:

```
postgres://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

**Connection pooling via Supavisor** (port 6543) — use for the application:

```
postgres://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

### Configure

Set `DATABASE_URL` in your `.env`:

```sh
DATABASE_URL=postgres://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

If using connection pooling (port 6543), the `postgres` client must disable prepared statements. Update `packages/db/src/client.ts`:

```ts
export function createDb(url: string) {
  const sql = postgres(url, { prepare: false });
  return drizzlePg(sql, { schema });
}
```

### Push the schema

```sh
# Use the direct connection (port 5432) for schema changes
DATABASE_URL=postgres://postgres.[PROJECT-REF]:[PASSWORD]@...5432/postgres \
  npx drizzle-kit push
```

### Free tier limits

- 500 MB database storage
- 200 concurrent connections
- Projects pause after 1 week of inactivity

See [Supabase pricing](https://supabase.com/pricing) for current details.

## 4. Railway (CLI / dashboard)

Use this when local **embedded** PostgreSQL is slow or stuck (e.g. migrations / tests) but you already have PostgreSQL on [Railway](https://railway.com/). Point Paperclip at Railway’s public connection string instead of starting embedded Postgres locally.

**Install the CLI** (if `railway` is not on `PATH`): `npm i -g @railway/cli`, or use [Railway’s official CLI install](https://docs.railway.com/develop/cli).

1. `railway login`
2. From a project directory: `railway link` (pick project and environment)
3. **Get `DATABASE_URL`:**
   - **CLI:** `railway variable list --kv` — add `-s <postgres-service-name>` if you have multiple services. (Aliases: `railway variables`, `railway vars`.)
   - **Injected env:** `railway run -- printenv DATABASE_URL` (works when that variable is defined for the run, e.g. Postgres plugin on the target service).
   - **Dashboard:** Project → your **Postgres** service (or the service that owns `DATABASE_URL`) → **Variables** — copy the value (`postgres://` or `postgresql://`).

4. Set it in the **user instance** env file (same pattern as `local-postgres.env.example` at the repo root):

   - Windows: `%USERPROFILE%\.paperclip\instances\default\.env`
   - Unix: `~/.paperclip/instances/default/.env`

   ```sh
   DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE
   ```

**Sealed** variables are not shown via the CLI; use the dashboard or Railway’s docs for that case.

## Switching between modes

The database mode is controlled by `DATABASE_URL`:

| `DATABASE_URL` | Mode |
|---|---|
| Not set | Embedded PostgreSQL (`~/.paperclip/instances/default/db/`) |
| `postgres://...localhost...` | Local Docker PostgreSQL |
| `postgres://...supabase.com...` | Hosted Supabase |
| `postgres://` / `postgresql://` (fx Railway) | External hosted Postgres (ingen embedded instans) |

Your Drizzle schema (`packages/db/src/schema/`) stays the same regardless of mode.

## Secret storage

Paperclip stores secret metadata and versions in:

- `company_secrets`
- `company_secret_versions`

For local/default installs, the active provider is `local_encrypted`:

- Secret material is encrypted at rest with a local master key.
- Default key file: `~/.paperclip/instances/default/secrets/master.key` (auto-created if missing).
- CLI config location: `~/.paperclip/instances/default/config.json` under `secrets.localEncrypted.keyFilePath`.

Optional overrides:

- `PAPERCLIP_SECRETS_MASTER_KEY` (32-byte key as base64, hex, or raw 32-char string)
- `PAPERCLIP_SECRETS_MASTER_KEY_FILE` (custom key file path)

Strict mode to block new inline sensitive env values:

```sh
PAPERCLIP_SECRETS_STRICT_MODE=true
```

You can set strict mode and provider defaults via:

```sh
pnpm paperclipai configure --section secrets
```

Inline secret migration command:

```sh
pnpm secrets:migrate-inline-env --apply
```
