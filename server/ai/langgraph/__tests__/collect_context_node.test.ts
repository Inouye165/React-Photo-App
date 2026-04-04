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

  it('does not fetch food POIs for collectables classification', async () => {
    reverseGeocode.mockResolvedValueOnce({ address: 'Collector St' });
    nearbyFoodPlaces.mockResolvedValueOnce([{ name: 'Should Not Be Fetched' }]);
    nearbyPlaces.mockResolvedValueOnce([{ name: 'Collector Museum' }]);
    nearbyTrailsFromOSM.mockResolvedValueOnce([]);

    const state = { filename: 'f4.jpg', metadata: {}, gpsString: '37.123,-122.456', classification: 'collectables', imageBase64: 'FAKE', imageMime: 'image/jpeg' };
    const res = await __testing.collect_context(state);
    expect(res.poiCache).toBeTruthy();
    expect(res.poiCache.nearbyFood).toEqual([]);
    expect(res.poiCache.nearbyPlaces).toEqual([]);
    expect(res.poiCache.reverseResult).toBeNull();
  });

  it('location_intelligence_agent uses poiCache and does not re-call googlePlaces', async () => {
    reverseGeocode.mockResolvedValueOnce({ address: 'Park Ave' });
    nearbyPlaces.mockResolvedValueOnce([{ name: 'Big Park' }]);
    nearbyFoodPlaces.mockResolvedValueOnce([]);
    nearbyTrailsFromOSM.mockResolvedValueOnce([]);

    const state = { filename: 'f3.jpg', metadata: {}, gpsString: '37.123,-122.456', classification: 'scenery' };
    const withCache = await __testing.collect_context(state);

    nearbyPlaces.mockImplementation(() => {
      throw new Error('nearbyPlaces should not be called when poiCache is present');
    });

    const { location_intelligence_agent } = __testing;
    const res = await location_intelligence_agent(withCache);
    expect(res.poiAnalysis).toBeTruthy();
    expect(res.poiAnalysis.nearbyPOIs && res.poiAnalysis.nearbyPOIs.length).toBeGreaterThanOrEqual(0);
  });

  it('location_intelligence_agent skips Google Places for collectables classification', async () => {
    reverseGeocode.mockResolvedValueOnce({ address: 'Collector St' });
    nearbyPlaces.mockResolvedValueOnce([{ name: 'Collector Museum' }]);
    nearbyFoodPlaces.mockResolvedValueOnce([]);
    nearbyTrailsFromOSM.mockResolvedValueOnce([]);

    const state = { filename: 'f5.jpg', metadata: {}, gpsString: '37.123,-122.456', classification: 'collectables' };
    const withCache = await __testing.collect_context(state);

    nearbyPlaces.mockImplementation(() => {
      throw new Error('nearbyPlaces should not be called for collectables');
    });

    const { location_intelligence_agent } = __testing;
    const res = await location_intelligence_agent(withCache);
    expect(res.poiAnalysis).toBeTruthy();
    expect(res.poiAnalysis.nearbyPOIs || []).toEqual([]);
  });
});

export {};