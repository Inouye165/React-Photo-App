# Changelog

## [Unreleased]

### ⚡ Performance
* **Optimized gallery performance:** Prioritized thumbnail loading over full-resolution images in `PhotoCard` component to reduce bandwidth usage and improve load times.

### 🐛 Bug Fixes
* **Fixed thumbnail generation:** Corrected orientation (auto-rotate) and improved resolution (90px -> 400px) in background processing pipeline.

## [v1.1.0] - 2025-10-30

### 🔒 Security (Critical)

* **Patched XSS Vulnerability:** Tokens are not stored in `localStorage` on the client (see `src/contexts/AuthContext.tsx`).
* **Hardened Server Middleware:** Protected API routes require `Authorization: Bearer <token>` (`server/middleware/auth.js`). Legacy cookie-based endpoints are deprecated/no-op; image routes may still have a deprecated cookie fallback.

### 🧹 Chore

* **Migrated ESLint Config:** Removed the deprecated `.eslintignore` file and migrated its rules into the top-level `ignores` array in `eslint.config.js`, resolving all linter warnings.
