
> Historical note: This is a point-in-time audit log. Paths, scripts, and doc status may not match the current main branch.

# Documentation Audit – Lumina

This file tracks all documentation in the repo, its purpose, review status, and known issues.

- **Repo clone:** Lumina-Docs
- **Audit branch:** docs/audit-2025-11-29
- **Created on:** 2025-11-29
- **Auditor:** Ron + LLM assistant

Legend:
- [ ] Reviewed — doc has **not yet** been thoroughly reviewed on this branch.
- [x] Reviewed — doc has been reviewed; notes/issues recorded below.
- **Last Reviewed:** date of last meaningful review on this branch.

---

## Root Documentation

### Markdown
| Reviewed | File Path         | Purpose / Description                                              | Last Reviewed | Issues / Notes |
|----------|-------------------|--------------------------------------------------------------------|---------------|----------------|
| [x]      | README.md         | Top-level overview, features, and quickstart.                      | 2025-11-29    | Synced quickstart, env vars, and dev/worker instructions with current backend/AI stack. Clarified required/optional env vars, Docker/Postgres/Redis setup, ports, and auth/security summary. |
| [ ]      | TESTING.md        | Comprehensive testing guide for Lumina.                             | Never         |                |
| [ ]      | SECURITY_REMEDIATION_SUMMARY.md | Summary of security remediations and vulnerabilities.             | Never         |                |
| [ ]      | CHANGELOG.md      | Project changelog and release history.                             | Never         |                |
| [ ]      | CONTRIBUTING.md   | Contribution guidelines and local dev/CI notes.                    | Never         |                |

### Non-Markdown
| Reviewed | File Path         | Type | Purpose / Description              | Last Reviewed | Issues / Notes |
|----------|-------------------|------|------------------------------------|---------------|----------------|
| [ ]      | git-history.txt   | txt  | Git commit history log; for reference.             | Never         |                |

---

## Server Documentation

### Markdown
| Reviewed | File Path                   | Purpose / Description                                         | Last Reviewed | Issues / Notes |
|----------|-----------------------------|---------------------------------------------------------------|---------------|----------------|
| [ ]      | server/README.md            | Backend/server setup, API, and environment details.            | Never         |                |
| [ ]      | server/MIGRATIONS.md        | Describes migration process and DB verification.               | Never         |                |
| [ ]      | server/scripts/README.md    | Explains integration runner and test-mode server scripts.      | Never         |                |

---

## Docs Folder

### Main Docs
| Reviewed | File Path                        | Purpose / Description                                         | Last Reviewed | Issues / Notes |
|----------|----------------------------------|---------------------------------------------------------------|---------------|----------------|
| [ ]      | docs/CONTRIBUTING.md             | Contribution guidelines (duplicate of root, if so, note).     | Never         |                |
| [ ]      | docs/CHANGELOG.md                | Changelog for docs or project.                                | Never         |                |
| [ ]      | docs/DEV.md                      | Developer notes and setup.                                    | Never         |                |
| [ ]      | docs/ENGINEERING_CASE_STUDY.md   | Engineering case study and architectural decisions.            | Never         |                |
| [ ]      | docs/SCALABILITY.md              | Scalability considerations and strategies.                     | Never         |                |
| [ ]      | docs/ROADMAP.md                  | Roadmap and planned features.                                  | Never         |                |
| [ ]      | docs/SECRET_ROTATION.md          | Secret rotation procedures.                                    | Never         |                |
| [ ]      | docs/PRODUCT_STORY.md            | Product/engineering journey narrative.                         | Never         |                |
| [ ]      | docs/PRODUCTION_SETUP.md         | Production environment setup and env vars.                     | Never         |                |
| [ ]      | docs/model-selection.md           | Dynamic OpenAI model selection logic.                          | Never         |                |
| [ ]      | docs/AUTHENTICATION.md           | Authentication system and security features.                   | Never         |                |
| [ ]      | docs/TESTING.md                  | Test running and CI setup.                                     | Never         |                |
| [ ]      | docs/error-handling-audit.md      | Error handling audit and notes.                                | Never         |                |
| [ ]      | docs/SECURITY_REMEDIATION_PRIVILEGE_ESCALATION.md | Privilege escalation remediation.         | Never         |                |
| [ ]      | docs/SECURITY_REMEDIATION_CWE489_DEBUG_ROUTES.md  | Debug route security remediation.           | Never         |                |
| [ ]      | docs/SECURITY_REMEDIATION_CWE489.md               | CWE-489 security remediation.               | Never         |                |

### History & Branch Reports
| Reviewed | File Path                                         | Purpose / Description                        | Last Reviewed | Issues / Notes |
|----------|---------------------------------------------------|----------------------------------------------|---------------|----------------|
| [ ]      | docs/history/server_PROBLEM_LOG.md                | Log of server endpoint issues and fixes.      | Never         |                |
| [ ]      | docs/history/SUPABASE_MIGRATION_SUMMARY.md        | Supabase migration summary.                   | Never         |                |
| [ ]      | docs/history/SPLIT_BRAIN_AUTH_FIX.md              | Split-brain auth fix report.                  | Never         |                |
| [ ]      | docs/history/UPLOAD_REFACTOR_SUMMARY.md           | Upload scalability refactor summary.          | Never         |                |
| [ ]      | docs/history/PROFESSIONAL_CODE_REVIEW_LOG.md      | Professional code review log.                 | Never         |                |
| [ ]      | docs/history/TEST_SUMMARY.md                      | Test summary and results.                     | Never         |                |
| [ ]      | docs/history/PR_DESCRIPTION_image_caching.md       | PR description: image caching.                | Never         |                |
| [ ]      | docs/history/PR_DESCRIPTION_fix_secure_cookie_auth.md | PR description: secure cookie auth.         | Never         |                |
| [ ]      | docs/history/PROBLEM_LOG.md                       | General problem log.                          | Never         |                |
| [ ]      | docs/history/PROBLEMS_SOLVED.md                   | Problems solved log.                          | Never         |                |

### Branch Reports
| Reviewed | File Path                                         | Purpose / Description                        | Last Reviewed | Issues / Notes |
|----------|---------------------------------------------------|----------------------------------------------|---------------|----------------|
| [ ]      | docs/branch-reports/refactor-centralize-api-logic.md | Branch report: API logic refactor.         | Never         |                |

---

## .github Templates

| Reviewed | File Path                          | Purpose / Description                        | Last Reviewed | Issues / Notes |
|----------|------------------------------------|----------------------------------------------|---------------|----------------|
| [ ]      | .github/PULL_REQUEST_TEMPLATE.md    | Pull request template for contributions.      | Never         |                |

---

## Diagnostics & Logs

| Reviewed | File Path                | Type | Purpose / Description                        | Last Reviewed | Issues / Notes |
|----------|--------------------------|------|----------------------------------------------|---------------|----------------|
| [ ]      | diag/jest.run.all.txt    | txt  | Output log from Jest test runs; diagnostics. | Never         |                |

---

## Audit File

| Reviewed | File Path                        | Purpose / Description                        | Last Reviewed | Issues / Notes |
|----------|----------------------------------|----------------------------------------------|---------------|----------------|
| [ ]      | docs/DOCUMENTATION_AUDIT.md       | This audit file: documentation inventory.     | 2025-11-30    |                |
