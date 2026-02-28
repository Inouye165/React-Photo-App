# CodeQL Open Alerts (from GitHub API)

This report summarizes **open** GitHub code scanning (CodeQL) alerts that were downloaded into `_codeql_alerts_open.json`.

- Repo: `Inouye165/React-Photo-App`
- Data source: `GET /repos/{owner}/{repo}/code-scanning/alerts?state=open&per_page=100&page=…`

## Summary

- Open alerts (all): **140**
- Alerts from generated Playwright HTML report: **79**
  - File: `server/playwright-report/index.html`
  - If you exclude `server/playwright-report/**`, remaining alerts: **61**
  - Status: CodeQL is now configured to ignore `**/playwright-report/**` in `.github/codeql/codeql-config.yml`.

## Security-tagged alerts (most important)

These are alerts where CodeQL includes the `security` tag.

- Security-tagged alerts: **28**
- By `rule.security_severity_level`:
  - **High**: 12
  - **Medium**: 16

### Top security rules (by count)

- `actions/missing-workflow-permissions`: 8
- `js/remote-property-injection`: 6
- `js/log-injection`: 5
- `js/user-controlled-bypass`: 4
- `js/insecure-temporary-file`: 2
- `js/http-to-file-access`: 2
- `actions/unpinned-tag`: 1

### Top security files (by count)

- `.github/workflows/ci.yml`: 5
- `server/logger.js`: 4
- `.github/workflows/secret-scan.yml`: 3
- `server/routes/display.js`: 3
- `server/routes/privilege.js`: 3
- `scripts/check-privilege.cjs`: 2
- `server/ai/service.js`: 2

## High severity (12)

> Note: a few alerts appear duplicated in the API output; this list is the “most recent instance” location per alert.

- `js/insecure-temporary-file`
  - `server/scripts/inspect-exif.js:31` — Insecure creation of file in the OS temp dir
  - `server/ai/service.js:685` — Insecure creation of file in the OS temp dir

- `js/remote-property-injection`
  - `server/logger.js:74` — Property name to write depends on user-provided value
  - `server/logger.js:76` — Property name to write depends on user-provided value
  - `server/services/userPreferences.js:208` — Property name to write depends on user-provided value
  - `server/routes/privilege.js:46` — Property name to write depends on user-provided value
  - `server/routes/privilege.js:49` — Property name to write depends on user-provided value
  - `server/routes/privilege.js:52` — Property name to write depends on user-provided value

- `js/user-controlled-bypass`
  - `server/routes/display.js:128` — Condition guards sensitive action but user controls it
  - `server/middleware/auth.js:102` — Condition guards sensitive action but user controls it

## Medium severity (16)

- GitHub Actions hardening
  - `actions/missing-workflow-permissions`
    - `.github/workflows/ci.yml:10,31,193,231,267`
    - `.github/workflows/secret-scan.yml:11,28`
    - `.github/workflows/integration.yml:10`
  - `actions/unpinned-tag`
    - `.github/workflows/secret-scan.yml:21` — `gitleaks/gitleaks-action@v2` not pinned to commit SHA

- Server/scripts logging + file access
  - `js/http-to-file-access`
    - `server/ai/service.js:685` — write depends on untrusted data
    - `server/ai/langgraph/audit_logger.js:16` — write depends on untrusted data

  - `js/log-injection`
    - `server/logger.js:303,307` — log entry depends on user-provided value
    - `scripts/check-privilege.cjs:43,46` — log entry depends on user-provided value
    - `scripts/docker-smoke.cjs:46` — log entry depends on user-provided value

## Non-security alerts (112)

These are mostly code-quality rules (for example `js/automatic-semicolon-insertion`, `js/trivial-conditional`, etc.).

The single biggest source of noise is the generated HTML report:

- `server/playwright-report/index.html`: 79 alerts

## Suggested next steps

1. **Reduce noise first** by excluding generated artifacts from CodeQL (example: ignore `server/playwright-report/**`, `coverage/**`, and other generated folders). This usually shrinks alert volume dramatically and makes real issues easier to see.
2. Triage the 28 security-tagged alerts:
   - Fix “high” issues first (`remote-property-injection`, `user-controlled-bypass`, insecure temp files).
   - Then tighten workflows (`permissions:` blocks, pin 3rd-party actions).
3. After the noise and security issues are handled, decide whether to mass-fix the code-quality rules or downgrade them.
