/**
 * Centralized JSON-ish parsing utilities.
 * Behavior (explicit + consistent):
 * - null/undefined/"" (or whitespace) => null
 * - invalid JSON string => null (never throws)
 * - already object/array => returned as-is
 */
function safeJsonParse(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  if (typeof value === 'object') {
    return value;
  }

  return null;
}

function safeParseObject(value: unknown): Record<string, unknown> | null {
  const parsed = safeJsonParse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function safeParseArray(value: unknown): unknown[] | null {
  const parsed = safeJsonParse(value);
  if (!Array.isArray(parsed)) return null;
  return parsed;
}

function safeParseUnknown(value: unknown): unknown {
  return safeJsonParse(value);
}

module.exports = {
  safeJsonParse,
  safeParseObject,
  safeParseArray,
  safeParseUnknown,
};

export {};
