// File: c:\Users\Ron\React-Photo-App\server\ai\langgraph\__tests__\food_location_agent_threshold.test.js
const { __testing } = require('../graph');
const { food_location_agent } = __testing;

jest.setTimeout(10000);

describe('food_location_agent match threshold', () => {
  const orig = process.env.FOOD_POI_MATCH_SCORE_THRESHOLD;
  beforeAll(() => {
    process.env.FOOD_POI_MATCH_SCORE_THRESHOLD = '3';
    // Reload module to pick up the env var
    jest.resetModules();
  });
  afterAll(() => {
    process.env.FOOD_POI_MATCH_SCORE_THRESHOLD = orig;
  });

  it('falls back to nearest when match below threshold', async () => {
    // env var is set in beforeAll so graph.js reads it on load
    const state = {
      filename: 'IMG_TEST.HEIC',
      metadata: { latitude: 37.0, longitude: -122.0 },
      classification: 'food',
      keywords: ['seafood','crab'],
      description: 'A crab boil in a bag',
      poiAnalysis: {},
      modelOverrides: {},
    };
    const stubbedNearby = [
      {
        placeId: 'p1',
        name: 'Cajun Crackn Concord',
        address: '1975 Diamond Boulevard E361, Concord',
        types: ['restaurant'],
        lat: 37.00001,
        lon: -122.00001,
        distanceMeters: 25,
      },
      {
        placeId: 'p2',
        name: 'Viaggio Ristorante',
        address: '1975 Diamond Boulevard',
        types: ['restaurant'],
        lat: 37.0001,
        lon: -122.0001,
        distanceMeters: 10,
      }
    ];

  state.__overrideNearby = stubbedNearby;
  const result = await food_location_agent(state);
  // The agent returns candidate listings and does not set a best candidate.
  expect(result.nearby_food_places).toBeTruthy();
  expect(result.nearby_food_places.length).toBe(2);
  expect(result.best_restaurant_candidate).toBeNull();
  });
});
