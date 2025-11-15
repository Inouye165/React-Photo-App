// Ensure the default threshold is applied when the graph loads
// Force the default threshold for this test suite and reload modules
process.env.FOOD_POI_MATCH_SCORE_THRESHOLD = '2';
jest.resetModules();
const { __testing } = require('../graph');
const { food_location_agent } = __testing;

jest.setTimeout(10000);

describe('food_location_agent', () => {
  it('prefers cuisine keyword match over nearest by distance', async () => {
    const state = {
      filename: 'IMG_TEST.HEIC',
      metadata: { latitude: 37.0, longitude: -122.0 },
      classification: 'food',
      keywords: ['seafood','crab'],
      description: 'A crab boil in a bag',
      poiAnalysis: {},
      modelOverrides: {},
    };

    // Fake nearbyFoodPlaces to return multiple candidates
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

    // Inject fake nearbyFoodPlaces via override
    state.__overrideNearby = stubbedNearby;
    const result = await food_location_agent(state);
    // result.best_restaurant_candidate should prefer the Cajun (keyword matched)
    expect(result.best_restaurant_candidate).not.toBeNull();
    expect(result.best_restaurant_candidate.name).toMatch(/Cajun Crackn/i);
    expect(result.best_restaurant_candidate.matchScore).toBeGreaterThanOrEqual(2);
  });
});
