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

function normalizeLevel(input) {
  if (input === undefined || input === null || input === '') {
    return 'info';
  }

  if (typeof input === 'number' && Number.isFinite(input)) {
    const entry = Object.entries(LEVEL_PRIORITY).find(([, priority]) => priority === input);
    if (!entry) {
      throw new Error(`Unknown numeric log level: ${input}`);
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
    throw new Error(`Unknown log level: ${input}`);
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
    const methodName = METHOD_MAP[normalized] || 'log';
    const method = typeof console[methodName] === 'function' ? console[methodName] : console.log;
    method.apply(console, preparedArgs);
    emit('log', { level: normalized, args: preparedArgs, bindings: this.bindings });
    if (normalized === 'error' || normalized === 'fatal') {
      emit('error', { level: normalized, args: preparedArgs, bindings: this.bindings });
    }
  }
}

const rootLogger = new TinyLogger();

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
