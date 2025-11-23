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

## Dependency Management

- We use Dependabot to keep dependencies tracked and to open upgrade PRs.
- All peer dependencies are properly aligned and should install without errors.
- If you encounter dependency conflicts, please report them as an issue.

Thanks — and welcome contributions!
