'use strict';

try {
  // Attempt direct TS require first in case the runtime supports it.
  module.exports = require('./logger.ts');
} catch {
  // Fall back to ts-node for JS entrypoints that still require ./logger.
  require('ts-node/register/transpile-only');
  module.exports = require('./logger.ts');
}
