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

For the full set (including JWT secret), run:

```bash
supabase status --output json
```

Map the values from that output like this:

- `API_URL` -> `SUPABASE_URL`
- `ANON_KEY` -> `SUPABASE_ANON_KEY`
- `SERVICE_ROLE_KEY` -> `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET` -> `SUPABASE_JWT_SECRET`
- `DB_URL` -> `SUPABASE_DB_URL` and `SUPABASE_DB_URL_MIGRATIONS`
- `S3_PROTOCOL_ACCESS_KEY_ID` -> `SUPABASE_STORAGE_ACCESS_KEY_ID`
- `S3_PROTOCOL_ACCESS_KEY_SECRET` -> `SUPABASE_STORAGE_SECRET_KEY`

Set these in [server/.env](../server/.env):

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
SUPABASE_JWT_SECRET=<local jwt secret>
```

For the DB URL, use the local Supabase Postgres port shown by `supabase status` (example below uses 54330):

```bash
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54330/postgres
SUPABASE_DB_URL_MIGRATIONS=postgresql://postgres:postgres@127.0.0.1:54330/postgres
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54330/postgres
```

Also set the frontend URL in the repo root `.env`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local anon key>
VITE_API_URL=http://localhost:3001
```

## 5) Apply migrations

```bash
supabase db push
```

That applies the SQL migrations from [supabase/migrations](../supabase/migrations).

---

## Desktop verification (2026-02-07)

This desktop setup was verified with:

- `supabase status` Project URL: `http://127.0.0.1:54321`
- DB URL: `postgresql://postgres:postgres@127.0.0.1:54330/postgres`
- Realtime: running, but required extra steps for local chat (see checklist below)

If you move to another computer, re-run `supabase status` and update all URLs/ports in `.env` and `server/.env` to match that machine.

If the DB port shown in `supabase status` does not match reality, check Docker directly and update your env files to the mapped port:

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}" | findstr supabase_db
```

## Local chat realtime checklist (desktop)

If chat messages only appear after refresh, apply these fixes in order:

1. Ensure realtime publication includes tables:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chess_moves;
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_members;
```

2. If realtime logs show RLS errors, disable RLS for local dev (messages + room_members):

```sql
ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members DISABLE ROW LEVEL SECURITY;
```

3. Reload PostgREST schema cache after DDL:

```sql
select pg_notify('pgrst','reload schema');
```

4. Restart realtime container:

```bash
docker restart supabase_realtime_photo-app
```

### Incident log — 2026-02-20 17:40 local

Observed repeated regression after local restart:

- Chat room creation failed with `403` on `POST /rest/v1/rooms?...` under RLS.
- `room_members.last_read_at` was missing, causing `400` on unread queries.
- Chat started working after policy/schema fixes, but chess remained refresh-only:
  - new games did not appear instantly in **My Games**
  - moves did not appear instantly for the other account

Root causes confirmed in local logs/state:

- `supabase_realtime` publication contained only `chess_moves` at one point (chat tables missing).
- FORCE RLS was enabled on `rooms`, `room_members`, and `messages` during failure windows.
- `rooms_select_member` policy did not include `created_by = auth.uid()` in the active DB policy.
- Game index UI had no realtime subscription and relied on manual refresh paths.

Fixes applied (push-only, no periodic polling):

1. DB hotfix + migration alignment:
	- ensured `room_members.last_read_at` exists
	- set `rooms_select_member` to allow creator reads (`created_by = auth.uid() OR is_room_member(id)`)
	- set chat tables to `NO FORCE ROW LEVEL SECURITY` (RLS remains enabled)
2. Realtime publication now includes:
	- `public.messages`
	- `public.room_members`
	- `public.rooms`
	- `public.chess_moves`
3. Realtime service restarted (`supabase_realtime_photo-app`) after publication update.
4. Frontend `GamesIndex` now subscribes to realtime game events and reloads by event only (no `setInterval` polling).

Bandwidth policy for this project:

- Use event-driven updates only for chess/chat multiplayer paths.
- Do not add timed polling loops for move propagation or game list freshness.

## Best first steps (chat/game realtime regression)

When chat or chess updates only appear after refresh, run these steps first in this exact order.

1. Confirm app is pointing to local Supabase gateway:

```bash
supabase status
docker ps --format "table {{.Names}}\t{{.Ports}}" | findstr supabase_kong
```

2. Confirm realtime publication includes all required tables:

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
```

Expected table set:

- `messages`
- `room_members`
- `rooms`
- `chess_moves`
- `games`
- `game_members`

3. Confirm RLS mode is safe for realtime apply on multiplayer tables:

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
	and c.relname in ('rooms','room_members','messages','games','game_members','chess_moves')
order by c.relname;
```

Expected: `rls_enabled = true`, `force_rls = false`.

4. Restart realtime container (no frontend/backend restart needed for this step):

```bash
docker restart supabase_realtime_photo-app
```

5. Hard refresh both browser tabs and retest with two accounts:

- Create/invite game -> opponent should see it without refresh.
- Make move -> opponent board should update without refresh.

6. If still failing, check logs before changing code:

```bash
docker logs --since 10m supabase_realtime_photo-app
docker logs --since 10m supabase_kong_photo-app
```

Note: A permanent migration now enforces publication membership for chat and games tables:

- `supabase/migrations/20260220181500_add_missing_realtime_publications_for_games_and_chat.sql`

---

## Super-Fast Recovery (desktop)

These are the three fastest fixes for the most time-consuming local failures.

### 1) Ghost Port Rule (54321 vs 55431)

**Symptom:** `ECONNREFUSED` or `404` during login or REST calls.

**Fix (10 seconds):**

- Run `docker ps` and find the host port mapped to `supabase_kong_photo-app`.
- If it is not `54321`, update both `.env` and `server/.env` to match the new port.

### 2) SSL Handshake Timeout

**Symptom:** `Knex: Timeout acquiring a connection` even though the DB connection test says OK.

**Fix (fast):**

- Ensure `DB_SSL_DISABLED=true` in `server/.env`.
- Local Docker Postgres usually does not speak SSL; Knex will wait forever if SSL is enabled.

### 3) PostgREST Cache Reload

**Symptom:** PostgREST returns `400` for a column that exists in the DB.

**Fix (5 seconds):**

```sql
select pg_notify('pgrst','reload schema');
```

Run it after any DDL change (columns, policies, table changes).

## Laptop troubleshooting considerations

If your laptop worked yesterday but stops after today’s changes, check:

- **Port drift**: `supabase status` may show different ports (update `.env` + `server/.env`).
- **Old auth tokens**: clear browser storage and re-sign in after DB reset.
- **Missing migrations**: if `last_read_at` errors appear, run `supabase db push`.
- **Realtime publication empty**: verify `supabase_realtime` contains `messages`, `room_members`, `rooms`, `chess_moves`, `games`, and `game_members`.
- **Realtime blocked by RLS**: apply the local dev RLS disable for `messages` + `room_members`.

Additional guidance for the laptop:

- Test before changing anything. If it still works, keep its config.
- If it fails, the highest-probability culprit is stale auth (clear browser LocalStorage `sb-` keys).
- Verify the Kong port via `docker ps` (look for `supabase_kong_<project>` and use that port).
- Confirm realtime publication includes `messages`, `room_members`, `rooms`, `chess_moves`, `games`, and `game_members`.

Troubleshooting priority:

1. Clear LocalStorage `sb-` keys.
2. Check Kong port via `docker ps` and update `.env` + `server/.env` if it drifted.
3. Verify realtime publication includes `messages`, `room_members`, `rooms`, `chess_moves`, `games`, and `game_members`.

If the laptop uses a separate stack name, confirm you are pointing to the correct Kong/DB containers and not mixing ports from the desktop.

---

## Port pinning (optional but recommended)

To avoid port drift, set explicit ports in `supabase/config.toml` and ensure they do not conflict with other local services. This keeps Supabase stable across restarts.

---

If you want to stop the stack:

```bash
supabase stop
```
