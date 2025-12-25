// File: c:\Users\Ron\React-Photo-App\server\ai\langgraph\__tests__\food_location_agent_fallback.test.js
const { __testing } = require('../graph');

jest.setTimeout(10000);

describe('food_location_agent fallback search', () => {
  beforeAll(() => {
    process.env.FOOD_POI_MATCH_SCORE_THRESHOLD = '2';
    process.env.ALLOW_DEV_DEBUG = 'true';
    jest.resetModules();
  });

  it('uses fallback radius to find a better cuisine match', async () => {
    const state = {
      filename: 'IMG_TEST.HEIC',
      metadata: { latitude: 37.0, longitude: -122.0 },
      classification: 'food',
      keywords: ['seafood','crab'],
      description: 'A crab boil in a bag',
      poiAnalysis: {},
      modelOverrides: {},
    };

    // initial / single radius nearby: return fallback when called with 30.48
    const tinyNearby = [
      {
        placeId: 'p_near',
        name: 'Viaggio Ristorante',
        address: 'Nearby address',
        types: ['restaurant'],
        lat: 37.0001,
        lon: -122.0001,
        distanceMeters: 10,
      }
    ];

    // fallback (larger radius) nearby: Cajun outside small radius but in fallback
    // fallback (our stubbed response): Cajun will be returned for the 30.48 radius
    const fallbackNearby = [
      {
        placeId: 'p_cajun',
        name: 'Cajun Crackn Concord',
        address: 'Far address',
        types: ['restaurant'],
        lat: 37.0003,
        lon: -122.0003,
        distanceMeters: 35,
      },
    ];

    // Do NOT override with state.__overrideNearby because we want the fallback path to call nearbyFoodPlaces
    // stub nearbyFoodPlaces to return fallback when radius matches fallback

    // Replace the nearbyFoodPlaces module function before loading the graph so the graph uses the stub.
    jest.resetModules();
    const poiModule = require('../../poi/foodPlaces');
    const originalNearbyFn = poiModule.nearbyFoodPlaces;
    poiModule.nearbyFoodPlaces = async (lat, lon, radius, _opts = {}) => {
      const usedRadius = Number(radius);
      if (Math.abs(usedRadius - 30.48) < 0.0001) return fallbackNearby;
      return tinyNearby;
    };

    // Re-require graph after resetting modules so it uses our stub
    const { __testing } = require('../graph');
    const { food_location_agent } = __testing;
    const result = await food_location_agent(state);
    expect(result.nearby_food_places.some(p => /Cajun Crackn/i.test(p.name))).toBe(true);

    // Restore the original function
    require('../../poi/foodPlaces').nearbyFoodPlaces = originalNearbyFn;
  });
});
