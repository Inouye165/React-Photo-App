## 🚀 Description
This PR resolves critical database connection failures encountered when connecting to Supabase from local development environments.

### 🧐 Root Cause Analysis
1.  **IPv6 vs IPv4**: Supabase's direct connection (port 5432) is IPv6-only. Our local environment (and many Docker setups) defaults to IPv4, causing connection timeouts.
2.  **SSL Configuration**: The previous `knexfile.js` enforced strict SSL for all non-local connections. However, local Docker containers often require SSL to be disabled, while Supabase requires it enabled (but often with self-signed cert compatibility).

## 🛠️ Changes
### 🔧 Database & Configuration
- **`server/knexfile.js`**: Implemented "Smart SSL" logic:
  - *Supabase*: Enforces SSL (`rejectUnauthorized: false`) to satisfy cloud requirements.
  - *Local Docker*: Disables SSL to prevent handshake failures.
- **`server/.env.example`**: Updated to use the **Supabase Transaction Pooler (port 6543)**. This endpoint supports IPv4, effectively bypassing the IPv6-only limitation of the direct connection.

### ✨ New Features
- **`server/scripts/verify-env.js`**: A new diagnostic script that:
  - Checks for required `.env` keys.
  - Validates the database connection string format.
  - Attempts a real connection to the database.
  - **Proactive Warning**: Detects if port 5432 is used with Supabase and warns the user about potential IPv6 issues.
- **`npm run verify:env`**: Added to `package.json` for easy execution.

### 📚 Documentation
- **`docs/TOOLS_AND_TESTS.md`**: Created comprehensive documentation for all available scripts (linting, testing, verification, DB management).
- **`README.md`**: Linked to the new tools documentation.

## ✅ Verification
- **Tests**: Ran `npm test` in `server/` -> **Pass** (73 passed).
- **Linting**: Ran `npm run lint` -> **Pass**.
- **Manual**: Verified connection to Supabase using `npm run verify:env`.

## 🔗 Issue
Fixes local development environment instability and database connectivity.