# Migrations (server)

Canonical migrations directory: `server/db/migrations`

Knex configuration points to this directory in `server/knexfile.js`.

Creating a migration:

- Example using Knex CLI (from the `server` folder):
  - npx knex migrate:make add_some_field --knexfile knexfile.js

Verifier:

- Run `npm run verify:migrations` (from `server/`) to check that the DB's `knex_migrations` entries match files on disk.
- The verifier is run automatically before `npm start` via the `prestart` script. To bypass locally: `SKIP_VERIFY_MIGRATIONS=true npm start`.
- Optional test: set `RUN_MIGRATION_VERIFY_TEST=true` to include the Jest verifier in `npm test`.

If Knex complains about missing files:

- Restore the missing migration file from VCS. If not available, create a no-op migration file with the exact missing filename (up/down that do nothing) and commit it.
