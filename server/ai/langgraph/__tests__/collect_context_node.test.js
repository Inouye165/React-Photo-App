jest.mock('../../poi/googlePlaces', () => ({ reverseGeocode: jest.fn(), nearbyPlaces: jest.fn() }));
jest.mock('../../poi/foodPlaces', () => ({ nearbyFoodPlaces: jest.fn() }));
jest.mock('../../poi/osmTrails', () => ({ nearbyTrailsFromOSM: jest.fn() }));

const { __testing } = require('../graph');
const { reverseGeocode, nearbyPlaces } = require('../../poi/googlePlaces');
const { nearbyFoodPlaces } = require('../../poi/foodPlaces');
const { nearbyTrailsFromOSM } = require('../../poi/osmTrails');

describe('collect_context node', () => {
  beforeEach(() => jest.resetAllMocks());

  it('collect_context attaches poiCache and summary for food classification', async () => {
    reverseGeocode.mockResolvedValueOnce({ address: '123 Main St' });
    nearbyFoodPlaces.mockResolvedValueOnce([{ name: 'Tasty Taco' }]);
    nearbyPlaces.mockResolvedValueOnce([]);
    nearbyTrailsFromOSM.mockResolvedValueOnce([]);

    const state = { filename: 'f1.jpg', metadata: {}, gpsString: '37.123,-122.456', classification: 'food', imageBase64: 'FAKE', imageMime: 'image/jpeg' };
    const res = await __testing.collect_context(state);
    expect(res.poiCache).toBeTruthy();
    expect(res.poiCache.nearbyFood).toBeTruthy();
    expect(res.poiCache.nearbyFood.length).toBe(1);
    expect(res.poiCacheSummary.nearbyFoodCount).toBe(1);
    expect(typeof res.poiCacheSummary.durationMs).toBe('number');
    expect(res.poiCacheFetchedAt).toBeTruthy();
    // For food classification generic POIs should be skipped
    expect(res.poiCache.nearbyPlaces).toEqual([]);
  });

  it('collect_context attaches poiCache for non-food classification', async () => {
    reverseGeocode.mockResolvedValueOnce({ address: 'Park Ave' });
    nearbyFoodPlaces.mockResolvedValueOnce([]);
    nearbyPlaces.mockResolvedValueOnce([{ name: 'Big Park' }]);
    nearbyTrailsFromOSM.mockResolvedValueOnce([{ id: 't1', name: 'Trail One' }]);

    const state = { filename: 'f2.jpg', metadata: {}, gpsString: '37.123,-122.456', classification: 'scenery', imageBase64: 'FAKE', imageMime: 'image/jpeg' };
    const res = await __testing.collect_context(state);
    expect(res.poiCache).toBeTruthy();
    expect(res.poiCache.nearbyPlaces.length).toBeGreaterThan(0);
    expect(res.poiCache.osmTrails.length).toBeGreaterThan(0);
    expect(res.poiCacheSummary.nearbyPlacesCount).toBeGreaterThan(0);
  });
});
