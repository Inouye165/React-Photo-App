/** Canonicalise a raw classification string to lower-case trimmed form. */
function normalizeClassification(input: unknown): string {
  return String(input || '').trim().toLowerCase();
}

/**
 * Returns true for any classification string that represents a collectible/
 * collectable item.
 */
function isCollectablesClassification(classification: unknown): boolean {
  const c = normalizeClassification(classification);
  return c === 'collectables' || c === 'collectible' || c.includes('collect');
}

/**
 * Returns true when the classification means we should skip the generic POI
 * lookup step.
 */
function shouldSkipGenericPoi(classification: unknown): boolean {
  const c = normalizeClassification(classification);
  const foodMatch = /\bfood\b/.test(c);
  return foodMatch || isCollectablesClassification(c);
}

module.exports = { normalizeClassification, isCollectablesClassification, shouldSkipGenericPoi };

export { normalizeClassification, isCollectablesClassification, shouldSkipGenericPoi };
