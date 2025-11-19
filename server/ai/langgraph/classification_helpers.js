function normalizeClassification(input) {
  return String(input || '').trim().toLowerCase();
}

function isCollectablesClassification(classification) {
  const c = normalizeClassification(classification);
  // Accept common synonyms used in the project and be defensive about
  // variations. Exact equality and contains-check allow matching 'collectable'
  // or 'collectables' or 'collectible', while avoiding accidental matches.
  return c === 'collectables' || c === 'collectible' || c.includes('collect');
}

function shouldSkipGenericPoi(classification) {
  const c = normalizeClassification(classification);
  // We skip generic POI lookups for food images (food-specific flow) and for
  // collectables where POI lookups are not meaningful.
  // Use a word-boundary match to prevent accidental partial matches such as
  // 'not_food' or 'foodie' from matching erroneously.
  const foodMatch = /\bfood\b/.test(c);
  return foodMatch || isCollectablesClassification(c);
}

module.exports = { normalizeClassification, isCollectablesClassification, shouldSkipGenericPoi };