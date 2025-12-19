# Running tests

This project uses Vitest for frontend tests and Jest/Supertest for backend tests. CI setup depends on your environment and is not guaranteed to be committed in this repository.

Requirements
- Node.js 20+ (see root `package.json` engines)
- npm 10+

Install dependencies

```bash
npm ci
```

Run all tests (frontend + any backend tests that are included in the test scripts):

```bash
npm test
```

Run tests with a UI (Vitest):

```bash
npm run test:ui
```

Run tests and collect coverage:

```bash
npm run test:coverage
```

Notes
- The test suite uses a local `package-lock.json` to ensure repeatable installations. Use `npm ci` in CI or on other machines.
- PostgreSQL is required for server tests and some integration/e2e flows. Frontend unit tests (`npm run test:run`) do not require Postgres.
- The repository's Vitest config excludes the `server/` folder, so unit/e2e tests in `src/` run by default.
