# GitHub Issue Draft

**Suggested Title:** `[SECURITY] Track removal of jest-openapi/openapi-validator override`

---

## Summary

A temporary dependency override is in place to avoid known high-severity axios vulnerabilities in the server project's dev tooling. This issue tracks the follow-up work to remove the override once upstream packages release fixed versions.

---

## Background

### Original Findings

`npm audit` in the `server/` project reported **3 high-severity vulnerabilities** in the transitive dependency chain:

| Advisory | Severity | Issue |
|----------|----------|-------|
| GHSA-wf5p-g6vw-rhxx | Moderate | Axios CSRF Vulnerability |
| GHSA-4hjh-wcwx-xvwj | High | Axios DoS via uncontrolled data size |
| GHSA-jr5f-v2jv-69x6 | High | Axios SSRF and Credential Leakage |

**Dependency chain:**
```
jest-openapi@0.14.2 (devDependency)
  └── openapi-validator@0.14.2
        └── axios@0.21.4 (VULNERABLE)
```

### Remediation Applied

- Pinned `jest-openapi` to `0.14.1` (stable release without axios in its dependency tree)
- Added `overrides` block in `server/package.json` to force `openapi-validator@0.14.1`
- **Scope:** Dev-only test tooling—no runtime or production code affected

---

## Current State

- ✅ `npm audit` reports **0 vulnerabilities**
- ✅ No axios in the server dependency tree
- ✅ All 520 tests pass
- ✅ Lint passes

---

## Follow-Up / Acceptance Criteria

This override should be removed when the following conditions are met:

- [ ] A new version of `jest-openapi` and/or `openapi-validator` is released that does not pull in vulnerable axios versions
- [ ] Remove the `overrides` block from `server/package.json`
- [ ] Update or loosen the `jest-openapi` version pin to a safe version that does not require overrides
- [ ] `npm install` + `npm audit` still show 0 vulnerabilities
- [ ] All tests and lint still pass
- [ ] Update `SECURITY_REMEDIATION_SUMMARY.md` to mark the override as removed

---

## References

- **Documentation:** [SECURITY_REMEDIATION_SUMMARY.md](./SECURITY_REMEDIATION_SUMMARY.md) (NPM Dependency Security Audit section)
- **Commit:** `<commit-sha-here>` — fix(server-deps): address npm audit high severity vulnerabilities
- **Branch:** `fix/server-security-audit`

---

## Labels

`security`, `dependencies`, `tech-debt`, `low-priority`

---

*This issue can be closed once the override is safely removed and the acceptance criteria are met.*
