const { writeFileSync, unlinkSync } = require('fs');
const { execSync } = require('child_process');
const msg = `Refactor server into modules, restore endpoints, add tests and CI

- Modularized server code into server/{config,db,media,ai,routes}
- Reimplemented POST /privilege and POST /save-captioned-image routes
- Added robust development logging and temporary repair behavior (removed)
- Added frontend instrumentation for checkPrivilege (logs outgoing JSON)
- Added scripts/check-privilege.cjs and integration-test.cjs for local testing
- Added GitHub Actions workflow .github/workflows/integration.yml to run integration test in CI
- Docs: docs/DEV.md describing dev-only behavior and how to run tests
`;
writeFileSync('commitmsg.txt', msg, { encoding: 'utf8' });
try {
  execSync('git add -A', { stdio: 'inherit' });
  execSync('git commit -F commitmsg.txt', { stdio: 'inherit' });
} finally {
  try { unlinkSync('commitmsg.txt'); } catch (e) {}
}
console.log('Committed changes');
