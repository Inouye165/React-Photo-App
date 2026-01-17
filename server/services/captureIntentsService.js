'use strict';

const crypto = require('crypto');

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function generateUuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toIsoString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function isExpired(expiresAt) {
  const iso = toIsoString(expiresAt);
  if (!iso) return false;
  return new Date(iso).getTime() <= Date.now();
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    photoId: row.photo_id,
    collectibleId: row.collectible_id ?? null,
    state: row.state,
    createdAt: toIsoString(row.created_at),
    consumedAt: toIsoString(row.consumed_at),
    expiresAt: toIsoString(row.expires_at),
  };
}

function createCaptureIntentsService({ db, ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!db) throw new Error('db is required');

  async function expireOpenIntents(userId) {
    if (!userId) return 0;
    const now = new Date().toISOString();
    return db('capture_intents')
      .where({ user_id: userId, state: 'open' })
      .andWhere('expires_at', '<=', now)
      .update({ state: 'expired' });
  }

  async function openIntent(userId, { photoId, collectibleId } = {}) {
    if (!userId) throw new Error('userId is required');
    if (!photoId) throw new Error('photoId is required');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

    const existing = await db('capture_intents')
      .where({ user_id: userId, state: 'open' })
      .orderBy('created_at', 'desc')
      .first();

    if (existing && existing.id) {
      await db('capture_intents')
        .where({ id: existing.id, user_id: userId })
        .update({
          photo_id: photoId,
          collectible_id: collectibleId ?? null,
          state: 'open',
          created_at: now.toISOString(),
          consumed_at: null,
          expires_at: expiresAt,
        });

      const updated = await db('capture_intents').where({ id: existing.id }).first();
      return normalizeRow(updated);
    }

    const id = generateUuid();
    await db('capture_intents').insert({
      id,
      user_id: userId,
      photo_id: photoId,
      collectible_id: collectibleId ?? null,
      state: 'open',
      created_at: now.toISOString(),
      consumed_at: null,
      expires_at: expiresAt,
    });

    const inserted = await db('capture_intents').where({ id }).first();
    return normalizeRow(inserted);
  }

  async function getOpenIntent(userId) {
    if (!userId) throw new Error('userId is required');

    await expireOpenIntents(userId);

    const row = await db('capture_intents')
      .where({ user_id: userId, state: 'open' })
      .orderBy('created_at', 'desc')
      .first();

    return normalizeRow(row);
  }

  async function consumeIntent(userId, intentId) {
    if (!userId) throw new Error('userId is required');
    if (!intentId) throw new Error('intentId is required');

    const existing = await db('capture_intents')
      .where({ id: intentId, user_id: userId })
      .first();

    if (!existing) return null;

    if (existing.state === 'consumed' || existing.state === 'canceled') {
      return normalizeRow(existing);
    }

    if (existing.state === 'expired' || isExpired(existing.expires_at)) {
      await db('capture_intents')
        .where({ id: intentId, user_id: userId })
        .update({ state: 'expired' });

      const expired = await db('capture_intents').where({ id: intentId }).first();
      return normalizeRow(expired);
    }

    await db('capture_intents')
      .where({ id: intentId, user_id: userId })
      .update({ state: 'consumed', consumed_at: new Date().toISOString() });

    const updated = await db('capture_intents').where({ id: intentId }).first();
    return normalizeRow(updated);
  }

  return {
    openIntent,
    getOpenIntent,
    consumeIntent,
    expireOpenIntents,
    normalizeRow,
  };
}

module.exports = createCaptureIntentsService;
