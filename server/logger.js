'use strict';

const LEVEL_PRIORITY = Object.freeze({
  silent: -1,
  fatal: 0,
  error: 10,
  warn: 20,
  info: 30,
  debug: 40,
  trace: 50
});

const LEVEL_ALIASES = Object.freeze({
  off: 'silent',
  none: 'silent',
  warning: 'warn',
  err: 'error'
});

const METHOD_MAP = Object.freeze({
  fatal: 'error',
  error: 'error',
  warn: 'warn',
  info: 'log',
  debug: typeof console.debug === 'function' ? 'debug' : 'log',
  trace: typeof console.debug === 'function' ? 'debug' : 'log'
});

// Capture the original console methods early so our internal logger sink
// doesn't route through our own global console wrappers (which would otherwise
// double-encode output).
const ORIGINAL_CONSOLE = {
  log: typeof console.log === 'function' ? console.log.bind(console) : null,
  warn: typeof console.warn === 'function' ? console.warn.bind(console) : null,
  error: typeof console.error === 'function' ? console.error.bind(console) : null,
  info: typeof console.info === 'function' ? console.info.bind(console) : null,
  debug: typeof console.debug === 'function' ? console.debug.bind(console) : null
};

const subscribers = {
  log: new Set(),
  error: new Set(),
  levelChange: new Set()
};

const SENSITIVE_KEYS = new Set([
  'token', 'password', 'secret', 'authorization', 'apikey', 'access_token', 'refresh_token',
  'cookie', 'set-cookie'
]);

const UNSAFE_PROPERTY_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

// Regex to match key=value or key%3Dvalue in strings
// Matches: (key)(separator)(value)
// Separator can be =, :, %3D, %3A
// Value is anything until & or whitespace or end of string
const SENSITIVE_REGEX = new RegExp(
  `(${Array.from(SENSITIVE_KEYS).join('|')})(%3D|=|%3A|:)([^&\\s]+)`,
  'gi'
);

function escapeLogNewlines(value) {
  if (typeof value !== 'string') return value;
  // Avoid log injection by preventing user-controlled CR/LF from creating
  // fake log entries or confusing multiline logs.
  return value.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

function isSafeObjectKey(key) {
  if (typeof key !== 'string') return false;
  const lowered = key.toLowerCase();
  if (UNSAFE_PROPERTY_KEYS.has(lowered)) return false;
  // Keep keys readable and bounded.
  if (key.length > 100) return false;
  return /^[a-zA-Z0-9._-]+$/.test(key);
}

function sanitizeBindingValue(value) {
  if (value === null || value === undefined) return '';
  return escapeLogNewlines(String(value));
}

function defineSafeProperty(target, key, value) {
  if (!isSafeObjectKey(key)) return;
  try {
    // lgtm[js/remote-property-injection] - Safe: key is allowlisted by isSafeObjectKey and target is a null-prototype object in all call sites.
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } catch {
    // Best-effort: if defineProperty fails for any reason, skip the key.
  }
}

function redact(arg, visited = new WeakSet()) {
  if (arg === null || arg === undefined) return arg;

  if (typeof arg === 'string') {
    const redacted = arg.replace(SENSITIVE_REGEX, '$1$2[REDACTED]');
    return escapeLogNewlines(redacted);
  }

  if (typeof arg === 'object') {
    if (visited.has(arg)) return '[Circular]';
    visited.add(arg);

    try {
      if (Array.isArray(arg)) {
        return arg.map(item => redact(item, visited));
      }

      // Handle plain objects and errors
      // Use a null-prototype object to avoid prototype pollution via keys like
      // __proto__/constructor/prototype.
      const redacted = Object.create(null);

      for (const key of Object.keys(arg)) {
        const lowerKey = String(key).toLowerCase();
        if (SENSITIVE_KEYS.has(lowerKey)) {
          defineSafeProperty(redacted, key, '[REDACTED]');
        } else {
          defineSafeProperty(redacted, key, redact(arg[key], visited));
        }
      }
      
      // Special handling for Error objects to make sure message/stack are captured/redacted
      if (arg instanceof Error) {
        defineSafeProperty(redacted, 'message', redact(arg.message, visited));
        defineSafeProperty(redacted, 'stack', redact(arg.stack, visited));
        defineSafeProperty(redacted, 'name', arg.name);
        // Copy any other properties that might have been missed if not enumerable
        // (though usually custom props on Error are enumerable)
      }

      return redacted;
    } finally {
      visited.delete(arg);
    }
  }

  return arg;
}

function normalizeLevel(input) {
  if (input === undefined || input === null || input === '') {
    return 'info';
  }

  if (typeof input === 'number' && Number.isFinite(input)) {
    const entry = Object.entries(LEVEL_PRIORITY).find(([, priority]) => priority === input);
    if (!entry) {
      // Fallback to default level instead of crashing
      return 'info';
    }
    return entry[0];
  }

  const lowered = String(input).trim().toLowerCase();
  if (lowered === '') {
    return 'info';
  }
  const alias = LEVEL_ALIASES[lowered];
  const levelName = alias || lowered;
  if (!Object.prototype.hasOwnProperty.call(LEVEL_PRIORITY, levelName)) {
    // Fallback to default level instead of crashing
    return 'info';
  }
  return levelName;
}

function resolveDefaultLevel() {
  const envLevel = process.env.SERVER_LOG_LEVEL || process.env.LOG_LEVEL;
  if (envLevel) {
    return normalizeLevel(envLevel);
  }
  if (process.env.NODE_ENV === 'test') {
    return 'warn';
  }
  return 'info';
}

let currentLevel = resolveDefaultLevel();

function shouldLog(levelName) {
  if (levelName === 'silent') {
    return false;
  }
  return LEVEL_PRIORITY[levelName] <= LEVEL_PRIORITY[currentLevel];
}

function applyBindings(bindings, args) {
  if (!bindings || Object.keys(bindings).length === 0) {
    return args;
  }

  const prefix = Object.entries(bindings)
    .filter(([key]) => isSafeObjectKey(key))
    .map(([key, value]) => `${key}=${sanitizeBindingValue(value)}`)
    .join(' ');

  if (!prefix) {
    return args;
  }

  const [first, ...rest] = args;
  if (typeof first === 'string') {
    return [`${prefix} ${first}`, ...rest];
  }
  return [prefix, ...args];
}

function emit(event, payload) {
  if (!subscribers[event]) {
    return;
  }
  for (const handler of subscribers[event]) {
    handler(payload);
  }
}

class TinyLogger {
  constructor(bindings) {
    if (bindings && typeof bindings === 'object' && Object.keys(bindings).length > 0) {
      const safeBindings = Object.create(null);
      for (const [key, value] of Object.entries(bindings)) {
        if (!isSafeObjectKey(key)) {
          continue;
        }
        defineSafeProperty(safeBindings, key, sanitizeBindingValue(value));
      }
      this.bindings = Object.freeze(safeBindings);
    } else {
      this.bindings = undefined;
    }
  }

  static setLevel(level) {
    const normalized = normalizeLevel(level);
    if (normalized === currentLevel) {
      return;
    }
    currentLevel = normalized;
    emit('levelChange', currentLevel);
  }

  static getLevel() {
    return currentLevel;
  }

  static isLevelEnabled(level) {
    const normalized = normalizeLevel(level);
    return shouldLog(normalized);
  }

  static withLevel(level, fn) {
    const prev = currentLevel;
    TinyLogger.setLevel(level);
    try {
      return fn();
    } finally {
      TinyLogger.setLevel(prev);
    }
  }

  static on(event, handler) {
    if (!subscribers[event]) {
      throw new Error(`Unknown logger event: ${event}`);
    }
    subscribers[event].add(handler);
    return () => TinyLogger.off(event, handler);
  }

  static off(event, handler) {
    if (!subscribers[event]) {
      return;
    }
    subscribers[event].delete(handler);
  }

  static reset() {
    currentLevel = resolveDefaultLevel();
  }

  setLevel(level) {
    TinyLogger.setLevel(level);
  }

  getLevel() {
    return TinyLogger.getLevel();
  }

  isLevelEnabled(level) {
    return TinyLogger.isLevelEnabled(level);
  }

  withLevel(level, fn) {
    return TinyLogger.withLevel(level, fn);
  }

  on(event, handler) {
    return TinyLogger.on(event, handler);
  }

  off(event, handler) {
    return TinyLogger.off(event, handler);
  }

  child(extraBindings) {
    if (!extraBindings || typeof extraBindings !== 'object' || Object.keys(extraBindings).length === 0) {
      return new TinyLogger(this.bindings);
    }
    const combined = Object.create(null);
    if (this.bindings && typeof this.bindings === 'object') {
      for (const [key, value] of Object.entries(this.bindings)) {
        if (isSafeObjectKey(key)) {
          // codeql[js/remote-property-injection] - Safe: combined is null-prototype and key is allowlisted by isSafeObjectKey before defineProperty.
          defineSafeProperty(combined, key, sanitizeBindingValue(value));
        }
      }
    }
    for (const [key, value] of Object.entries(extraBindings)) {
      if (isSafeObjectKey(key)) {
        // codeql[js/remote-property-injection] - Safe: combined is null-prototype and key is allowlisted by isSafeObjectKey before defineProperty.
        defineSafeProperty(combined, key, sanitizeBindingValue(value));
      }
    }
    return new TinyLogger(combined);
  }

  trace(...args) {
    this.#log('trace', args);
  }

  debug(...args) {
    this.#log('debug', args);
  }

  info(...args) {
    this.#log('info', args);
  }

  warn(...args) {
    this.#log('warn', args);
  }

  error(...args) {
    this.#log('error', args);
  }

  fatal(...args) {
    this.#log('fatal', args);
  }

  #log(levelName, args) {
    const normalized = normalizeLevel(levelName);
    if (!shouldLog(normalized)) {
      return;
    }
    const preparedArgs = applyBindings(this.bindings, args);

    // Redact arguments before logging or emitting
    const redactedArgs = preparedArgs.map(arg => redact(arg));

    // Final sink hardening: emit a single-line string to the console.
    // This avoids multiline log injection (CWE-117) and is easier for CodeQL
    // to reason about than passing arbitrary objects/args.
    const safeLine = JSON.stringify(redactedArgs).replace(/[\r\n]/g, ' ');

    const methodName = METHOD_MAP[normalized] || 'log';
    const sink = ORIGINAL_CONSOLE[methodName] || ORIGINAL_CONSOLE.log;
    if (typeof sink === 'function') {
      try {
        sink(safeLine);
      } catch {
        // Last resort: try to use process.stderr if available
        if (typeof process !== 'undefined' && process.stderr && typeof process.stderr.write === 'function') {
          process.stderr.write(`[Logger Error] ${safeLine}\n`);
        }
      }
    }
    emit('log', { level: normalized, args: redactedArgs, bindings: this.bindings });
    if (normalized === 'error' || normalized === 'fatal') {
      emit('error', { level: normalized, args: redactedArgs, bindings: this.bindings });
    }
  }
}

const rootLogger = new TinyLogger();

// Wrap global console methods to apply redaction everywhere
['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
  if (typeof console[method] === 'function' && ORIGINAL_CONSOLE[method]) {
    console[method] = function(...args) {
      const redactedArgs = args.map(arg => redact(arg));
      const safeLine = JSON.stringify(redactedArgs).replace(/[\r\n]/g, ' ');
      ORIGINAL_CONSOLE[method](safeLine);
    };
  }
});

module.exports = rootLogger;
module.exports.TinyLogger = TinyLogger;
module.exports.setLevel = TinyLogger.setLevel;
module.exports.getLevel = TinyLogger.getLevel;
module.exports.isLevelEnabled = TinyLogger.isLevelEnabled;
module.exports.withLevel = TinyLogger.withLevel;
module.exports.on = TinyLogger.on;
module.exports.off = TinyLogger.off;
module.exports.child = (bindings) => rootLogger.child(bindings);
module.exports.reset = TinyLogger.reset;
module.exports.levels = Object.freeze({ ...LEVEL_PRIORITY });
module.exports.normalizeLevel = normalizeLevel;
module.exports.defaultLevel = resolveDefaultLevel;
module.exports._subscribers = subscribers;
