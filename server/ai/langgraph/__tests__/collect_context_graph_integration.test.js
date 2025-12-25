jest.mock('../../poi/googlePlaces', () => ({ reverseGeocode: jest.fn(), nearbyPlaces: jest.fn() }));
jest.mock('../../poi/foodPlaces', () => ({ nearbyFoodPlaces: jest.fn() }));
jest.mock('../../poi/osmTrails', () => ({ nearbyTrailsFromOSM: jest.fn() }));

const { reverseGeocode, nearbyPlaces } = require('../../poi/googlePlaces');
const { nearbyFoodPlaces } = require('../../poi/foodPlaces');
const { nearbyTrailsFromOSM } = require('../../poi/osmTrails');
const { collectContext } = require('../collect_context');

describe('Collect context integration (no LangGraph dependency)', () => {
  beforeEach(() => jest.resetAllMocks());

  it('collects food context while skipping generic POI lookups', async () => {
    reverseGeocode.mockResolvedValueOnce({ address: '123 Food St' });
    nearbyPlaces.mockResolvedValueOnce([{ placeId: 'p0', name: 'ShouldNotBeUsed' }]);
    nearbyFoodPlaces.mockResolvedValueOnce([{ placeId: 'p1', name: 'Food Place', address: '123 Food St' }]);
    nearbyTrailsFromOSM.mockResolvedValueOnce([{ id: 't1' }]);

    const out = await collectContext({
      lat: 37.123,
      lon: -122.456,
      classification: 'food',
      fetchFood: true,
      runId: 'test-run',
    });

    expect(reverseGeocode).toHaveBeenCalled();
    expect(nearbyFoodPlaces).toHaveBeenCalled();
    // For food, we intentionally skip generic POI and OSM trails to reduce cost/noise.
    expect(nearbyPlaces).not.toHaveBeenCalled();
    expect(nearbyTrailsFromOSM).not.toHaveBeenCalled();
    expect(out.nearbyFood.length).toBeGreaterThanOrEqual(1);
  });
});
