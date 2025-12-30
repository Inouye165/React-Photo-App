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

function isSafePropertyKey(key) {
  return typeof key === 'string' && !UNSAFE_PROPERTY_KEYS.has(key);
}

// Regex to match key=value or key%3Dvalue in strings
// Matches: (key)(separator)(value)
// Separator can be =, :, %3D, %3A
// Value is anything until & or whitespace or end of string
const SENSITIVE_REGEX = new RegExp(
  `(${Array.from(SENSITIVE_KEYS).join('|')})(%3D|=|%3A|:)([^&\\s]+)`,
  'gi'
);

function redact(arg, visited = new WeakSet()) {
  if (arg === null || arg === undefined) return arg;

  if (typeof arg === 'string') {
    return arg.replace(SENSITIVE_REGEX, '$1$2[REDACTED]');
  }

  if (typeof arg === 'object') {
    if (visited.has(arg)) return '[Circular]';
    visited.add(arg);

    try {
      if (Array.isArray(arg)) {
        return arg.map(item => redact(item, visited));
      }

      // Handle plain objects and errors
      const redacted = Object.create(null);
      for (const key in arg) {
        // We iterate over all properties including prototype for Error objects usually, 
        // but for plain objects just own properties.
        // However, for Error objects, message and stack are often not enumerable.
        if (Object.prototype.hasOwnProperty.call(arg, key)) {
          if (!isSafePropertyKey(key)) {
            continue;
          }
          const lowerKey = key.toLowerCase();
          if (SENSITIVE_KEYS.has(lowerKey)) {
            redacted[key] = '[REDACTED]';
          } else {
            redacted[key] = redact(arg[key], visited);
          }
        }
      }
      
      // Special handling for Error objects to make sure message/stack are captured/redacted
      if (arg instanceof Error) {
        redacted.message = redact(arg.message, visited);
        redacted.stack = redact(arg.stack, visited);
        redacted.name = arg.name;
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
    .map(([key, value]) => `${key}=${value}`)
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
      this.bindings = Object.freeze({ ...bindings });
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
    const base = this.bindings ? { ...this.bindings } : {};
    return new TinyLogger({ ...base, ...extraBindings });
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

    const methodName = METHOD_MAP[normalized] || 'log';
    const method = typeof console[methodName] === 'function' ? console[methodName] : console.log;
    // SAFETY: Check that method exists and has apply before calling
    // This prevents crashes when Jest or other tools modify console at runtime
    if (typeof method === 'function' && typeof method.apply === 'function') {
      try {
        method.apply(console, redactedArgs);
      } catch {
        // Fallback to direct call if apply fails (extremely rare, but defensive)
        try {
          method(...redactedArgs);
        } catch {
          // Last resort: try to use process.stderr if available
          if (typeof process !== 'undefined' && process.stderr && typeof process.stderr.write === 'function') {
            process.stderr.write(`[Logger Error] ${JSON.stringify(redactedArgs)}\n`);
          }
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
const originalConsole = {
  log: console.log ? console.log.bind(console) : null,
  warn: console.warn ? console.warn.bind(console) : null,
  error: console.error ? console.error.bind(console) : null,
  info: console.info ? console.info.bind(console) : null,
  debug: console.debug ? console.debug.bind(console) : null,
};

['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
  if (typeof console[method] === 'function' && originalConsole[method]) {
    console[method] = function(...args) {
      const redactedArgs = args.map(arg => redact(arg));
      originalConsole[method](...redactedArgs);
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
