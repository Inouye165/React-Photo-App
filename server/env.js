'use strict';

try {
  // Attempt direct TS require first in case the runtime supports it.
  module.exports = require('./env.ts');
} catch {
  // Fall back to ts-node for JS entrypoints that still require ./env.
  require('ts-node/register/transpile-only');
  module.exports = require('./env.ts');
}
