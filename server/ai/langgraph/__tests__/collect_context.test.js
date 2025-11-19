jest.mock('../../poi/googlePlaces', () => ({ reverseGeocode: jest.fn(), nearbyPlaces: jest.fn() }));
jest.mock('../../poi/foodPlaces', () => ({ nearbyFoodPlaces: jest.fn() }));
jest.mock('../../poi/osmTrails', () => ({ nearbyTrailsFromOSM: jest.fn() }));

const { collectContext } = require('../collect_context');
const { reverseGeocode, nearbyPlaces } = require('../../poi/googlePlaces');
const { nearbyFoodPlaces } = require('../../poi/foodPlaces');
const { nearbyTrailsFromOSM } = require('../../poi/osmTrails');

describe('collectContext', () => {
  beforeEach(() => jest.resetAllMocks());

  it('fetches reverse geocode and nearby places for non-food classification', async () => {
    reverseGeocode.mockResolvedValueOnce({ address: '123 Main' });
    nearbyPlaces.mockResolvedValueOnce([{ name: 'Big Park' }]);
    nearbyTrailsFromOSM.mockResolvedValueOnce([{ id: 't1', name: 'Trail 1' }]);
    const out = await collectContext({ lat: 37.1, lon: -122.0, classification: 'scenery', fetchFood: false });
    expect(out.reverseResult.address).toBe('123 Main');
    expect(Array.isArray(out.nearbyPlaces)).toBeTruthy();
    expect(out.nearbyFood.length).toBe(0);
    expect(Array.isArray(out.osmTrails)).toBeTruthy();
  });

  it('skips generic POI for food classification but collects nearbyFood when requested', async () => {
    reverseGeocode.mockResolvedValueOnce({ address: 'Foodland' });
    nearbyPlaces.mockResolvedValueOnce([{ name: 'Park' }]);
    nearbyFoodPlaces.mockResolvedValueOnce([{ name: 'Tasty' }]);
    const out = await collectContext({ lat: 37.1, lon: -122.0, classification: 'food', fetchFood: true });
    expect(out.nearbyPlaces.length).toBe(0);
    expect(out.nearbyFood.length).toBeGreaterThan(0);
    expect(out.nearbyFood[0].name).toBe('Tasty');
  });

  it('skips all POI and reverse geocode for collectables classification', async () => {
    reverseGeocode.mockResolvedValueOnce({ address: 'Collect St' });
    nearbyPlaces.mockResolvedValueOnce([{ name: 'Sample Place' }]);
    nearbyFoodPlaces.mockResolvedValueOnce([{ name: 'Nope' }]);
    nearbyTrailsFromOSM.mockResolvedValueOnce([{ id: 't1', name: 'Trail 1' }]);

    const out = await collectContext({ lat: 37.1, lon: -122.0, classification: 'collectables', fetchFood: true });
    expect(out.reverseResult).toBeNull();
    expect(out.nearbyPlaces).toEqual([]);
    expect(out.nearbyFood).toEqual([]);
    expect(out.osmTrails).toEqual([]);
  });
});
