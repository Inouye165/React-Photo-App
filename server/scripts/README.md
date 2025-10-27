Integration runner
==================

What this script does
---------------------

`integration-runner.js` is a small helper that starts the server in test mode, waits for it to seed a test photo, issues a PATCH request to the photo state endpoint (PATCH /photos/1/state) using a generated JWT, captures server stdout/stderr while the request runs, prints the server response, and then shuts the server down.

It is intended for local verification and debugging. It uses the project's test-mode configuration (NODE_ENV=test) so it does not require access to a real Supabase/Postgres instance when the repository is configured to run in test mode.

When to use
-----------

- To reproduce the storage-move -> fallback behavior locally without external services.
- To capture server logs and the response body for debugging the PATCH /photos/:id/state flow.

Important environment variables
-------------------------------

- NODE_ENV=test  (the runner launches the server with this by default)
- JWT_SECRET     (optional — the runner will fall back to the repo default if not provided; use the same secret the server expects for Authorization JWTs)
- PORT           (optional — default port used by the server)
- ALLOW_DEV_DEBUG (optional — set to true to enable extra debug logging in test mode)

How to run (PowerShell)
------------------------

Run from the repository root (PowerShell):

```powershell
# start the runner (it will spawn the server in test mode, run the request, print logs, then exit)
node .\server\scripts\integration-runner.js
```

If you need to override environment variables for the run, set them inline in PowerShell:

```powershell
# example: set a custom JWT secret and port for the run
# WARNING: do NOT commit real secrets. Set your JWT secret in your environment and never check it into source control.
$env:JWT_SECRET = '<YOUR_JWT_SECRET_HERE>'
$env:PORT = '4000'
node .\server\scripts\integration-runner.js
```

What to expect
---------------

- The script will print server stdout/stderr lines as the server starts and when it processes the request.
- You should see a test seed message such as: "[TEST SEED] Inserted test photo id= 1 filename= seed-test.jpg".
- The script then issues PATCH /photos/1/state and prints the HTTP response (status, body). In test mode the server may return debug `error_details` — these are gated by NODE_ENV (they are only present when NODE_ENV !== 'production').

Security / production note
--------------------------

Do NOT use this runner in production. It is explicitly designed to run the server in test mode and to reveal additional debug information (when NODE_ENV is not 'production'). In production the server is intentionally configured to omit detailed error internals from API responses.

Next steps / tips
-----------------

- If you want to run a similar end-to-end test against live Supabase/Postgres, launch the real server (not test mode) and make sure the proper DATABASE_URL and SUPABASE credentials are available in the environment. Consider adding a dedicated env toggle (for example SHOW_ERROR_DETAILS) if you need controlled debug output in non-production staging.
- Add this README snippet into a higher-level developer doc if you want teammates to run the same checks.
