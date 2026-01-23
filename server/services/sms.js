'use strict';

try {
  module.exports = require('./sms.ts');
} catch {
  require('ts-node/register/transpile-only');
  module.exports = require('./sms.ts');
}
