> Historical note: This is a point-in-time log. Paths, scripts, or auth models may not match the current main branch.

# Server — Problems solved log

## Knex startup error: “migration directory is corrupt … file missing”
Date: 2025-11-03T

Symptoms:
- Server crashed at startup with Knex error: "The migration directory is corrupt, the following files are missing: 20251102000004_add_ai_model_column.js"

Root cause:
- The `knex_migrations` table referenced a migration that was not present on disk in the canonical migrations directory used by the server (`server/db/migrations`).

Fix applied:
- Created a no-op migration file at `server/db/migrations/20251102000004_add_ai_model_column.js` to match the DB record so Knex can proceed.
- Added a migration verifier script (`server/scripts/check-migrations.js`) and hooked it into `server/package.json` as a prestart check (`prestart`).

Prevention:
- `npm run verify:migrations` compares DB-recorded migrations vs files on disk and exits non-zero if any DB-recorded files are missing.
- Optional Jest verification test is available (opt-in) via `RUN_MIGRATION_VERIFY_TEST=true`.

Commands used (PowerShell snippets):
- Create no-op migration file:
  - New-Item -Path server/db/migrations/20251102000004_add_ai_model_column.js -ItemType File
  - (edit file to include no-op up/down)
- Verify DB connectivity:
  - Set-Location server; npm run test:db
- Run migration verifier:
  - Set-Location server; npm run verify:migrations
- Start server:
  - Set-Location server; npm start

Status: Resolved

(This file is managed by maintenance scripts — do not commit secrets here.)

## Duplicate migration cleanup
Date: 2025-11-03T12:00:00-08:00

Action: Removed duplicate placeholder migration file under `server/migrations/` to avoid confusion with the canonical migration directory `server/db/migrations`. The canonical migration remains at `server/db/migrations/20251102000004_add_ai_model_column.js`.

Reason: Duplicate migration files caused uncertainty and could lead to verifier or Knex mismatches across developer environments. This cleanup ensures the verifier and Knex reference the canonical location.

## Duplicate migration file deleted (strict)
Date: 2025-11-03T13:05:00-08:00

Action: Strictly deleted `server/migrations/20251102000004_add_ai_model_column.js` to remove ambiguity. The canonical migration remains at `server/db/migrations/20251102000004_add_ai_model_column.js`.

Note: If any developer tools or scripts referenced the deleted path, update them to reference the canonical directory. This deletion was intentional and recorded in the run log.

## Reliable health-check added
Date: 2025-11-03T12:31:20-08:00

Action: Added a retrying health-check script (`server/health-check.js`) and `npm run health` which probe IPv6, IPv4, and localhost with a 10s deadline to make CI and local checks more reliable.

Note: The checker retries for 10s and exits 0 on first HTTP 200. If health fails during a run it is recorded and no speculative fixes are attempted.
