export {};

const { __testing } = require('../graph');
const { route_after_context } = __testing;
const { END } = require('@langchain/langgraph');

describe('Sprint 1 Router Logic', () => {
  test('should route "collectables" to identify_collectible', () => {
    const state: Record<string, unknown> = { classification: 'collectables' };
    const result: string = route_after_context(state);
    expect(result).toBe('identify_collectible');
  });

  test.each([
    'collectible',
    'Collectable comics',
    'collectibles',
    'collectables - comics',
  ])('should route collectible variants (%s) to identify_collectible', (classification: string) => {
    const state: Record<string, unknown> = { classification };
    const result: string = route_after_context(state);
    expect(result).toBe('identify_collectible');
  });

  test('should route "scenery" to location_intelligence_agent', () => {
    const state: Record<string, unknown> = { classification: 'scenery' };
    const result: string = route_after_context(state);
    expect(result).toBe('location_intelligence_agent');
  });

  test('should route "food" to location_intelligence_agent', () => {
    const state: Record<string, unknown> = { classification: 'food' };
    const result: string = route_after_context(state);
    expect(result).toBe('location_intelligence_agent');
  });

  test('should handle error state', () => {
    const state: Record<string, unknown> = { error: 'Some error' };
    const result: string = route_after_context(state);
    expect(result).toBe(END);
  });
});
