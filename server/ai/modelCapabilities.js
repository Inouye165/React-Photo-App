'use strict';

const logger = require('../logger');

function normalizeModelName(name) {
  return (name || '').trim().toLowerCase();
}

const BASE_VISION_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4o-2024-05-13',
  'gpt-4o-2024-08-06',
  'gpt-4o-mini-2024-07-18',
  'gpt-4o-mini-2024-07-18-intl',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4.1-preview',
  'gpt-4.1-turbo',
  'o4',
  'o4-mini',
  'o4-preview',
  'chatgpt-4o-latest'
];

const KNOWN_VISION_MODELS = new Set(BASE_VISION_MODELS.map(normalizeModelName));

const DEFAULT_VISION_MODEL = process.env.AI_VISION_FALLBACK || 'gpt-4o-mini';
if (DEFAULT_VISION_MODEL && !KNOWN_VISION_MODELS.has(normalizeModelName(DEFAULT_VISION_MODEL))) {
  KNOWN_VISION_MODELS.add(normalizeModelName(DEFAULT_VISION_MODEL));
}

function isVisionModel(modelName) {
  const normalized = normalizeModelName(modelName);
  if (!normalized) return false;
  if (KNOWN_VISION_MODELS.has(normalized)) return true;
  if (normalized.includes('vision')) return true;
  if (/^gpt-4o/.test(normalized)) return true;
  if (/^gpt-4\.1/.test(normalized)) return true;
  if (/^o4/.test(normalized)) return true;
  if (/^chatgpt-4o/.test(normalized)) return true;
  if (/^gpt-4v/.test(normalized)) return true;
  return false;
}

function ensureVisionModel(modelName, fallback = DEFAULT_VISION_MODEL, context) {
  if (isVisionModel(modelName)) {
    return modelName;
  }
  if (modelName) {
    const message = `[AI] Model "${modelName}"${context ? ` for ${context}` : ''} does not support vision inputs; using "${fallback}" instead.`;
    if (logger && typeof logger.warn === 'function') {
      logger.warn(message);
    }
  }
  return fallback;
}

function getVisionAllowlist(extraNames = []) {
  const merged = new Set([...BASE_VISION_MODELS, DEFAULT_VISION_MODEL, ...extraNames.filter(Boolean)]);
  return Array.from(merged);
}

module.exports = {
  DEFAULT_VISION_MODEL,
  BASE_VISION_MODELS,
  isVisionModel,
  ensureVisionModel,
  getVisionAllowlist
};
