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
      keywords: ['seafood', 'crab'],
      description: 'A crab boil in a bag',
      poiAnalysis: {},
      modelOverrides: {},
    };

    const tinyNearby = [
      {
        placeId: 'p_near',
        name: 'Viaggio Ristorante',
        address: 'Nearby address',
        types: ['restaurant'],
        lat: 37.0001,
        lon: -122.0001,
        distanceMeters: 10,
      },
    ];

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

    jest.resetModules();
    const poiModule = require('../../poi/foodPlaces');
    const originalNearbyFn = poiModule.nearbyFoodPlaces;
    poiModule.nearbyFoodPlaces = async (_lat, _lon, radius, _opts = {}) => {
      const usedRadius = Number(radius);
      if (Math.abs(usedRadius - 30.48) < 0.0001) return fallbackNearby;
      return tinyNearby;
    };

    const { __testing } = require('../graph');
    const { food_location_agent } = __testing;
    const result = await food_location_agent(state);
    expect(result.nearby_food_places.some((poi) => /Cajun Crackn/i.test(poi.name))).toBe(true);

    require('../../poi/foodPlaces').nearbyFoodPlaces = originalNearbyFn;
  });
});

export {};