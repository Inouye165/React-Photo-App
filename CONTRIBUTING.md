# Contributing

Thanks for contributing to this project — a few notes to make local development and CI consistent.

## Installing dependencies

This repository uses standard npm installation.

When setting up locally prefer:

```powershell
# clean install (Windows / PowerShell)
npm ci

# or if you need to update lockfiles
npm install
```

## Running tests

Frontend (from repository root):

```powershell
npm run test:run
```

Server (from `server/`):

```powershell
cd server
npm run test:ci
```

## Mandatory tests before push

This repo enforces a pre-push hook that runs the full test suite. Pushes are blocked
unless all tests pass.

If you **must** skip tests, you must supply a reason:

```powershell
$env:SKIP_TESTS = "1"
$env:SKIP_TESTS_REASON = "Explain why there is no valid test to run"
git push
```

If you set `SKIP_TESTS` without `SKIP_TESTS_REASON`, the hook will fail.

## Dependency Management

- We use Dependabot to keep dependencies tracked and to open upgrade PRs.
- All peer dependencies are properly aligned and should install without errors.
- If you encounter dependency conflicts, please report them as an issue.

Thanks — and welcome contributions!
