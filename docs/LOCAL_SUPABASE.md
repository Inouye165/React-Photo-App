# Local Supabase Stack (Studio UI)

This project already includes Supabase SQL migrations in [supabase/migrations](../supabase/migrations). To get a Railway-like UI (auth/users, tables, policies), run Supabase locally and use Studio.

## 1) Install Supabase CLI

See: https://supabase.com/docs/guides/cli

## 2) Start the local stack

```bash
supabase start
```

This starts Postgres, Auth, Storage, Realtime, and Studio.

## 3) Open Studio

- http://localhost:54323

Studio is where you can manage users, auth, tables, and policies.

## 4) Use local Supabase keys in the app

When `supabase start` finishes, it prints the local `anon` and `service_role` keys.

Set these in [server/.env](../server/.env):

```bash
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
SUPABASE_JWT_SECRET=<local jwt secret>
```

For the DB URL, use the local Supabase Postgres port (default 54322):

```bash
SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54322/postgres
SUPABASE_DB_URL_MIGRATIONS=postgresql://postgres:postgres@localhost:54322/postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

## 5) Apply migrations

```bash
supabase db push
```

That applies the SQL migrations from [supabase/migrations](../supabase/migrations).

---

If you want to stop the stack:

```bash
supabase stop
```
