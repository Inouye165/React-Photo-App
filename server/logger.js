'use strict';

try {
  // Attempt direct TS require first in case the runtime supports it.
  module.exports = require('./logger.ts');
} catch {
  const fallbackLogger = {
    trace: (...args) => console.debug(...args),
    debug: (...args) => console.debug(...args),
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
    fatal: (...args) => console.error(...args),
    child: () => fallbackLogger,
    setLevel: () => {},
    getLevel: () => 'info',
    isLevelEnabled: () => true,
    withLevel: (_level, fn) => fn(),
    on: () => () => {},
    off: () => {},
    reset: () => {},
  };

  module.exports = fallbackLogger;
}
