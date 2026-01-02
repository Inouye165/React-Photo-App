const { __testing } = require('../graph');
const { route_after_location } = __testing;
const { END } = require('@langchain/langgraph');

describe('route_after_location Router Logic', () => {
  test('should end graph on error', () => {
    const state = { error: 'Some error' };
    const result = route_after_location(state);
    expect(result).toBe(END);
  });

  test('should route food to food_location_agent', () => {
    const state = { classification: 'food' };
    const result = route_after_location(state);
    expect(result).toBe('food_location_agent');
  });

  test('should route scenery with gpsString to decide_scene_label', () => {
    const state = {
      classification: 'scenery',
      poiAnalysis: { gpsString: '1,2' },
    };
    const result = route_after_location(state);
    expect(result).toBe('decide_scene_label');
  });

  test('should route collectible to handle_collectible', () => {
    const state = { classification: 'collectible' };
    const result = route_after_location(state);
    expect(result).toBe('handle_collectible');
  });

  test('should route other classifications to generate_metadata', () => {
    const state = { classification: 'random' };
    const result = route_after_location(state);
    expect(result).toBe('generate_metadata');
  });
});
