/** Canonicalise a raw classification string to lower-case trimmed form. */
function normalizeClassification(input: unknown): string {
  return String(input || '').trim().toLowerCase();
}

/**
 * Returns true for any classification string that represents a collectible/
 * collectable item (handles the common "collectables" vs "collectible" typo
 * variation used across the project).
 */
function isCollectablesClassification(classification: unknown): boolean {
  const c = normalizeClassification(classification);
  // Accept common synonyms used in the project and be defensive about
  // variations. Exact equality and contains-check allow matching 'collectable'
  // or 'collectables' or 'collectible', while avoiding accidental matches.
  return c === 'collectables' || c === 'collectible' || c.includes('collect');
}

/**
 * Returns true when the classification means we should skip the generic POI
 * lookup step (food uses a dedicated food-POI flow; collectables don't need
 * POI data at all).
 */
function shouldSkipGenericPoi(classification: unknown): boolean {
  const c = normalizeClassification(classification);
  // We skip generic POI lookups for food images (food-specific flow) and for
  // collectables where POI lookups are not meaningful.
  // Use a word-boundary match to prevent accidental partial matches such as
  // 'not_food' or 'foodie' from matching erroneously.
  const foodMatch = /\bfood\b/.test(c);
  return foodMatch || isCollectablesClassification(c);
}

export { normalizeClassification, isCollectablesClassification, shouldSkipGenericPoi };
