# Changelog

## [v1.1.0] - 2025-10-30

### 🔒 Security (Critical)

* **Patched XSS Vulnerability:** Removed all usage of `localStorage` for storing JWTs on the client (`src/contexts/AuthContext.jsx`). The application now exclusively relies on a server-set, `httpOnly` cookie for authentication.
* **Hardened Server Middleware:** The `authenticateToken` middleware (`server/middleware/auth.js`) was updated to *only* accept the `httpOnly` cookie. The fallback for `Authorization: Bearer` headers has been removed for browser-facing routes, mitigating the risk of stolen tokens.

### 🧹 Chore

* **Migrated ESLint Config:** Removed the deprecated `.eslintignore` file and migrated its rules into the top-level `ignores` array in `eslint.config.js`, resolving all linter warnings.
