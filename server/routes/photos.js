// Thin compatibility wrapper.
// Loads the TypeScript implementation at runtime.
// This avoids needing Jest/Babel TypeScript parsing just to load the router.
require('ts-node/register/transpile-only');

module.exports = require('./photos.ts');

