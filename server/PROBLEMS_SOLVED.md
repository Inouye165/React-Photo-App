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
