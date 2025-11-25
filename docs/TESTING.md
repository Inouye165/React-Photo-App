# Running tests

This project uses Vitest for frontend tests and Jest/Supertest for backend tests. The repository includes a GitHub Actions workflow that runs tests on pushes and pull requests to `main`.

Requirements
- Node.js 18+ (LTS recommended)
- npm

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
- PostgreSQL is required for all tests. Use `docker-compose up -d db` to start a local PostgreSQL instance, or configure `DATABASE_URL` to point to an existing PostgreSQL server.
- The repository's Vitest config excludes the `server/` folder, so unit/e2e tests in `src/` run by default.
