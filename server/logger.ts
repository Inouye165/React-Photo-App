'use strict';

const LEVEL_PRIORITY = {
  silent: -1,
  fatal: 0,
  error: 10,
  warn: 20,
  info: 30,
  debug: 40,
  trace: 50
} as const;

type LogLevelName = keyof typeof LEVEL_PRIORITY;
type ConsoleMethodName = 'log' | 'warn' | 'error' | 'info' | 'debug';
type LoggerEvent = 'log' | 'error' | 'levelChange';

const LEVEL_ALIASES: Partial<Record<string, LogLevelName>> = {
  off: 'silent',
  none: 'silent',
  warning: 'warn',
  err: 'error'
};

const METHOD_MAP: Record<LogLevelName, ConsoleMethodName> = {
  fatal: 'error',
  error: 'error',
  warn: 'warn',
  info: 'log',
  debug: typeof console.debug === 'function' ? 'debug' : 'log',
  trace: typeof console.debug === 'function' ? 'debug' : 'log',
  silent: 'log'
};

type LoggerBindings = Readonly<Record<string, string>>;

type LogEventPayload = {
  level: LogLevelName;
  args: unknown[];
  bindings?: LoggerBindings;
};

type LoggerEventPayloadMap = {
  log: LogEventPayload;
  error: LogEventPayload;
  levelChange: LogLevelName;
};

type LoggerHandler<K extends LoggerEvent> = (payload: LoggerEventPayloadMap[K]) => void;

type SubscriberMap = {
  [K in LoggerEvent]: Set<LoggerHandler<K>>;
};

// Capture the original console methods early so our internal logger sink
// doesn't route through our own global console wrappers (which would otherwise
// double-encode output).
const ORIGINAL_CONSOLE: Record<ConsoleMethodName, ((...args: unknown[]) => void) | null> = {
  log: typeof console.log === 'function' ? console.log.bind(console) : null,
  warn: typeof console.warn === 'function' ? console.warn.bind(console) : null,
  error: typeof console.error === 'function' ? console.error.bind(console) : null,
  info: typeof console.info === 'function' ? console.info.bind(console) : null,
  debug: typeof console.debug === 'function' ? console.debug.bind(console) : null
};

const subscribers: SubscriberMap = {
  log: new Set<LoggerHandler<'log'>>(),
  error: new Set<LoggerHandler<'error'>>(),
  levelChange: new Set<LoggerHandler<'levelChange'>>()
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

function escapeLogNewlines(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  // Avoid log injection by preventing user-controlled CR/LF from creating
  // fake log entries or confusing multiline logs.
  return value.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

function isSafeObjectKey(key: unknown): key is string {
  // SECURITY: This function validates keys BEFORE any property access occurs.
  // It prevents prototype pollution by:
  // 1. Rejecting non-string keys
  // 2. Blocking known dangerous keys (__proto__, prototype, constructor, etc.)
  // 3. Restricting to alphanumeric + [._-] characters only
  // 4. Limiting key length to prevent DoS
  //
  // CodeQL Note: The lowered.toLowerCase() operation and Set.has() lookup are SAFE:
  // - UNSAFE_PROPERTY_KEYS is a Set (not an Object), so .has() uses the Set's internal
  //   hash table, not prototype chain lookups
  // - The key cannot affect the Set's prototype or structure
  // lgtm[js/remote-property-injection]
  if (typeof key !== 'string') return false;
  const lowered = key.toLowerCase();
  if (UNSAFE_PROPERTY_KEYS.has(lowered)) return false;
  // Keep keys readable and bounded.
  if (key.length > 100) return false;
  return /^[a-zA-Z0-9._-]+$/.test(key);
}

function sanitizeBindingValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const sanitized = escapeLogNewlines(String(value));
  return typeof sanitized === 'string' ? sanitized : String(sanitized);
}

function defineSafeProperty(target: Record<string, unknown>, key: string, value: unknown): void {
  if (!isSafeObjectKey(key)) return;
  try {
    // Safe: key is validated by isSafeObjectKey which only allows alphanumeric + [._-]
    // and explicitly blocks __proto__, prototype, constructor.
    // Target is always a null-prototype object in all call sites.
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

function redact(arg: unknown, visited: WeakSet<object> = new WeakSet<object>()): unknown {
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
        return arg.map((item) => redact(item, visited));
      }

      // Handle plain objects and errors
      // Use a null-prototype object to avoid prototype pollution via keys like
      // __proto__/constructor/prototype.
      const redacted = Object.create(null) as Record<string, unknown>;

      for (const key of Object.keys(arg)) {
        const lowerKey = String(key).toLowerCase();
        if (SENSITIVE_KEYS.has(lowerKey)) {
          defineSafeProperty(redacted, key, '[REDACTED]');
        } else {
          defineSafeProperty(redacted, key, redact((arg as Record<string, unknown>)[key], visited));
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

function normalizeLevel(input: unknown): LogLevelName {
  if (input === undefined || input === null || input === '') {
    return 'info';
  }

  if (typeof input === 'number' && Number.isFinite(input)) {
    const entry = Object.entries(LEVEL_PRIORITY).find(([, priority]) => priority === input);
    if (!entry) {
      // Fallback to default level instead of crashing
      return 'info';
    }
    return entry[0] as LogLevelName;
  }

  const lowered = String(input).trim().toLowerCase();
  if (lowered === '') {
    return 'info';
  }
  const alias = LEVEL_ALIASES[lowered];
  const levelName = alias || (lowered as LogLevelName);
  if (!Object.prototype.hasOwnProperty.call(LEVEL_PRIORITY, levelName)) {
    // Fallback to default level instead of crashing
    return 'info';
  }
  return levelName;
}

function resolveDefaultLevel(): LogLevelName {
  const envLevel = process.env.SERVER_LOG_LEVEL || process.env.LOG_LEVEL;
  if (envLevel) {
    return normalizeLevel(envLevel);
  }
  if (process.env.NODE_ENV === 'test') {
    return 'warn';
  }
  return 'info';
}

let currentLevel: LogLevelName = resolveDefaultLevel();

function shouldLog(levelName: LogLevelName): boolean {
  if (levelName === 'silent') {
    return false;
  }
  return LEVEL_PRIORITY[levelName] <= LEVEL_PRIORITY[currentLevel];
}

function applyBindings(bindings: LoggerBindings | undefined, args: unknown[]): unknown[] {
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

function emit<K extends LoggerEvent>(event: K, payload: LoggerEventPayloadMap[K]): void {
  const handlers = subscribers[event];
  if (!handlers) {
    return;
  }
  for (const handler of handlers) {
    handler(payload);
  }
}

class TinyLogger {
  private readonly bindings?: LoggerBindings;

  constructor(bindings?: Record<string, unknown>) {
    if (bindings && typeof bindings === 'object' && Object.keys(bindings).length > 0) {
      const safeBindings = Object.create(null) as Record<string, string>;
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

  static setLevel(level: unknown): void {
    const normalized = normalizeLevel(level);
    if (normalized === currentLevel) {
      return;
    }
    currentLevel = normalized;
    emit('levelChange', currentLevel);
  }

  static getLevel(): LogLevelName {
    return currentLevel;
  }

  static isLevelEnabled(level: unknown): boolean {
    const normalized = normalizeLevel(level);
    return shouldLog(normalized);
  }

  static withLevel<T>(level: unknown, fn: () => T): T {
    const prev = currentLevel;
    TinyLogger.setLevel(level);
    try {
      return fn();
    } finally {
      TinyLogger.setLevel(prev);
    }
  }

  static on<K extends LoggerEvent>(event: K, handler: LoggerHandler<K>): () => void {
    const handlers = subscribers[event];
    if (!handlers) {
      throw new Error(`Unknown logger event: ${event}`);
    }
    handlers.add(handler as LoggerHandler<typeof event>);
    return () => TinyLogger.off(event, handler);
  }

  static off<K extends LoggerEvent>(event: K, handler: LoggerHandler<K>): void {
    const handlers = subscribers[event];
    if (!handlers) {
      return;
    }
    handlers.delete(handler as LoggerHandler<typeof event>);
  }

  static reset(): void {
    currentLevel = resolveDefaultLevel();
  }

  setLevel(level: unknown): void {
    TinyLogger.setLevel(level);
  }

  getLevel(): LogLevelName {
    return TinyLogger.getLevel();
  }

  isLevelEnabled(level: unknown): boolean {
    return TinyLogger.isLevelEnabled(level);
  }

  withLevel<T>(level: unknown, fn: () => T): T {
    return TinyLogger.withLevel(level, fn);
  }

  on<K extends LoggerEvent>(event: K, handler: LoggerHandler<K>): () => void {
    return TinyLogger.on(event, handler);
  }

  off<K extends LoggerEvent>(event: K, handler: LoggerHandler<K>): void {
    TinyLogger.off(event, handler);
  }

  child(extraBindings?: Record<string, unknown>): TinyLogger {
    if (!extraBindings || typeof extraBindings !== 'object' || Object.keys(extraBindings).length === 0) {
      return new TinyLogger(this.bindings ? { ...this.bindings } : undefined);
    }
    const combined = Object.create(null) as Record<string, string>;
    if (this.bindings && typeof this.bindings === 'object') {
      for (const [key, value] of Object.entries(this.bindings)) {
        if (isSafeObjectKey(key)) {
          // Safe: key validated by isSafeObjectKey, combined is null-prototype
          defineSafeProperty(combined, key, sanitizeBindingValue(value));
        }
      }
    }
    for (const [key, value] of Object.entries(extraBindings)) {
      if (isSafeObjectKey(key)) {
        // Safe: key validated by isSafeObjectKey, combined is null-prototype
        defineSafeProperty(combined, key, sanitizeBindingValue(value));
      }
    }
    return new TinyLogger(combined);
  }

  trace(...args: unknown[]): void {
    this.#log('trace', args);
  }

  debug(...args: unknown[]): void {
    this.#log('debug', args);
  }

  info(...args: unknown[]): void {
    this.#log('info', args);
  }

  warn(...args: unknown[]): void {
    this.#log('warn', args);
  }

  error(...args: unknown[]): void {
    this.#log('error', args);
  }

  fatal(...args: unknown[]): void {
    this.#log('fatal', args);
  }

  #log(levelName: LogLevelName, args: unknown[]): void {
    const normalized = normalizeLevel(levelName);
    if (!shouldLog(normalized)) {
      return;
    }
    const preparedArgs = applyBindings(this.bindings, args);

    // Redact arguments before logging or emitting
    const redactedArgs = preparedArgs.map((arg) => redact(arg));

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
const consoleMethods: ConsoleMethodName[] = ['log', 'warn', 'error', 'info', 'debug'];
for (const method of consoleMethods) {
  const original = ORIGINAL_CONSOLE[method];
  const consoleMethod = console[method] as ((...args: unknown[]) => void) | undefined;
  if (typeof consoleMethod === 'function' && original) {
    console[method] = (...args: unknown[]) => {
      const redactedArgs = args.map((arg) => redact(arg));
      const safeLine = JSON.stringify(redactedArgs).replace(/[\r\n]/g, ' ');
      original(safeLine);
    };
  }
}

const levels: Readonly<Record<LogLevelName, number>> = Object.freeze({ ...LEVEL_PRIORITY });

interface LoggerExport extends TinyLogger {
  TinyLogger: typeof TinyLogger;
  setLevel: typeof TinyLogger.setLevel;
  getLevel: typeof TinyLogger.getLevel;
  isLevelEnabled: typeof TinyLogger.isLevelEnabled;
  withLevel: typeof TinyLogger.withLevel;
  on: typeof TinyLogger.on;
  off: typeof TinyLogger.off;
  child: (bindings?: Record<string, unknown>) => TinyLogger;
  reset: typeof TinyLogger.reset;
  levels: Readonly<Record<LogLevelName, number>>;
  normalizeLevel: typeof normalizeLevel;
  defaultLevel: typeof resolveDefaultLevel;
  _subscribers: SubscriberMap;
}

const exportedLogger = Object.assign(rootLogger, {
  TinyLogger,
  setLevel: TinyLogger.setLevel,
  getLevel: TinyLogger.getLevel,
  isLevelEnabled: TinyLogger.isLevelEnabled,
  withLevel: TinyLogger.withLevel,
  on: TinyLogger.on,
  off: TinyLogger.off,
  child: (bindings?: Record<string, unknown>) => rootLogger.child(bindings),
  reset: TinyLogger.reset,
  levels,
  normalizeLevel,
  defaultLevel: resolveDefaultLevel,
  _subscribers: subscribers
}) as LoggerExport;

export = exportedLogger;