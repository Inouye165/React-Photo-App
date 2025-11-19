const { isCollectablesClassification, shouldSkipGenericPoi } = require('../classification_helpers');

describe('classification_helpers', () => {
  it('matches collectables and synonyms', () => {
    expect(isCollectablesClassification('collectables')).toBe(true);
    expect(isCollectablesClassification('collectible')).toBe(true);
    expect(isCollectablesClassification('Collectables')).toBe(true);
    expect(isCollectablesClassification('random')).toBe(false);
  });

  it('skip generic poi for food and collectables', () => {
    expect(shouldSkipGenericPoi('food')).toBe(true);
    expect(shouldSkipGenericPoi('not_food')).toBe(false);
    expect(shouldSkipGenericPoi('collectables')).toBe(true);
  });
});