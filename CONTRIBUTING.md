# Contributing

Thanks for contributing to this project — a few notes to make local development and CI consistent.

## Installing dependencies

This repository currently has a transitive peer-dependency mismatch between some AI-related packages.
As a short-term workaround we install with npm's legacy peer-deps behavior so CI and local installs remain stable.

When setting up locally prefer:

```powershell
# clean install (Windows / PowerShell)
npm ci --legacy-peer-deps

# or if you need to update lockfiles
npm install --legacy-peer-deps
```

If you run plain `npm ci` without `--legacy-peer-deps` you may hit an ERESOLVE peer-dependency error. CI contains a non-blocking check which will emit a warning in that case.

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

## Long-term plan

- We should resolve the underlying peer dependency mismatch (either by upgrading/downgrading the conflicting packages or by using a controlled `overrides` entry in `package.json`).
- Use Dependabot or Renovate to keep dependencies tracked and to open upgrade PRs.
- Avoid relying on `--legacy-peer-deps` forever; it is a pragmatic short-term fix but masks actual compatibility issues.

If you'd like, I can open a follow-up PR to attempt a safe resolution (e.g. try upgrading `@langchain/community` or pin an `openai` version that is compatible) and run the full test suite.

Thanks — and welcome contributions!
