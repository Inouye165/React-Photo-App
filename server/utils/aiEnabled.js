'use strict';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function readBooleanEnv(env, key) {
  const raw = env[key];
  if (raw == null) return undefined;
  const normalized = String(raw).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return undefined;
}

function isAiEnabled(env = process.env) {
  const explicit = readBooleanEnv(env, 'AI_ENABLED');
  if (explicit !== undefined) return explicit;
  const alias = readBooleanEnv(env, 'ENABLE_AI');
  if (alias !== undefined) return alias;

  const nodeEnv = String(env.NODE_ENV || 'development').toLowerCase();
  return nodeEnv === 'production';
}

function shouldRequireOpenAiKey(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || 'development').toLowerCase();
  if (nodeEnv === 'test') return false;
  return isAiEnabled(env);
}

module.exports = {
  isAiEnabled,
  shouldRequireOpenAiKey,
};
