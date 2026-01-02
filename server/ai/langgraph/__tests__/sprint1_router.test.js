const { __testing } = require('../graph');
const { route_after_context } = __testing;
const { END } = require('@langchain/langgraph');

describe('Sprint 1 Router Logic', () => {
  test('should route "collectables" to identify_collectible', () => {
    const state = { classification: 'collectables' };
    const result = route_after_context(state);
    expect(result).toBe('identify_collectible');
  });

  test.each([
    'collectible',
    'Collectable comics',
    'collectibles',
    'collectables - comics',
  ])('should route collectible variants (%s) to identify_collectible', (classification) => {
    const state = { classification };
    const result = route_after_context(state);
    expect(result).toBe('identify_collectible');
  });

  test('should route "scenery" to location_intelligence_agent', () => {
    const state = { classification: 'scenery' };
    const result = route_after_context(state);
    expect(result).toBe('location_intelligence_agent');
  });

  test('should route "food" to location_intelligence_agent', () => {
    const state = { classification: 'food' };
    const result = route_after_context(state);
    expect(result).toBe('location_intelligence_agent');
  });

  test('should handle error state', () => {
    const state = { error: 'Some error' };
    const result = route_after_context(state);
    expect(result).toBe(END);
  });
});
