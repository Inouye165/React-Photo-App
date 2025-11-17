const { nearbyFoodPlaces } = require('./foodPlaces');

describe('foodPlaces nearbyFoodPlaces', () => {
  it('returns empty array when lat/lon missing', async () => {
    const res = await nearbyFoodPlaces(null, null, 250, { fetch: async () => ({ ok: true, json: async () => ({ results: [] }) }) });
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(0);
  });

  it('normalizes and sorts returned restaurants by distance', async () => {
    const result = [
      {
        place_id: 'p2',
        name: 'Far Bar',
        types: ['bar', 'restaurant'],
        geometry: { location: { lat: 37.125, lng: -122.456 } },
        vicinity: 'Oakland, CA',
        rating: 4.2,
        user_ratings_total: 65,
      },
      {
        place_id: 'p1',
        name: 'Near Cafe',
        types: ['cafe'],
        geometry: { location: { lat: 37.123, lng: -122.456 } },
        vicinity: 'Oakland, CA',
        rating: 4.5,
        user_ratings_total: 120,
      },
    ];
    const fakeFetch = async () => ({ ok: true, json: async () => ({ status: 'OK', results: result }) });
    const pois = await nearbyFoodPlaces(37.123, -122.456, 250, { fetch: fakeFetch });
    expect(pois.length).toBeGreaterThanOrEqual(2);
    expect(pois[0].name).toBe('Near Cafe');
    expect(pois[1].name).toBe('Far Bar');
    expect(pois[0].distanceMeters).toBeLessThanOrEqual(pois[1].distanceMeters);
    expect(pois[0].placeId).toBe('p1');
    expect(pois[1].placeId).toBe('p2');
  });

  it('expands radius up to FOOD_PLACES_MAX_RADIUS_METERS and returns results when available', async () => {
    const originalStart = process.env.FOOD_PLACES_START_RADIUS_METERS;
    const originalMax = process.env.FOOD_PLACES_MAX_RADIUS_METERS;
    process.env.FOOD_PLACES_START_RADIUS_METERS = '50';
    process.env.FOOD_PLACES_MAX_RADIUS_METERS = '300';

    // Fake fetch returns no results for small radii, and returns a candidate for larger radius
    const fakeFetch = jest.fn((url) => {
      const params = new URLSearchParams(url.split('?')[1]);
      const radius = Number(params.get('radius'));
      if (radius < 250) {
        return Promise.resolve({ ok: true, json: async () => ({ results: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ results: [ { place_id: 'p_large', name: 'Far Restaurant', types: ['restaurant'], geometry: { location: { lat: 1, lng: 2 } } } ] }) });
    });

    const pois = await nearbyFoodPlaces(37.123, -122.456, 15, { fetch: fakeFetch });
    expect(pois.length).toBeGreaterThan(0);
    expect(pois[0].placeId).toBe('p_large');

    // Restore env
    process.env.FOOD_PLACES_START_RADIUS_METERS = originalStart;
    process.env.FOOD_PLACES_MAX_RADIUS_METERS = originalMax;
  });
});
