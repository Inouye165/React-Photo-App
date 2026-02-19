'use strict';

try {
  // Attempt direct TS require first in case the runtime supports it.
  module.exports = require('./env.ts');
} catch {
  const fs = require('fs');
  const path = require('path');
  const dotenv = require('dotenv');

  if (!process.env.__SERVER_ENV_LOADED) {
    const candidatePaths = [
      path.join(__dirname, '.env.local'),
      path.join(__dirname, '..', '.env.local'),
      path.join(__dirname, '.env'),
      path.join(__dirname, '..', '.env'),
    ];
    const envPath = candidatePaths.find((candidate) => fs.existsSync(candidate)) || candidatePaths[0];
    dotenv.config({ path: envPath });
    process.env.__SERVER_ENV_LOADED = '1';
  }

  module.exports = process.env;
}
