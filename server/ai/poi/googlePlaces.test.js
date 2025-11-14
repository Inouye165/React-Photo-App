describe('googlePlaces POI heuristics', () => {
  it('should categorize as trail if name matches trail keywords even if types do not', async () => {
    const fakeResult = [{
      place_id: 'abc123',
      name: 'Contra Costa Canal Trail',
      types: ['park'],
      geometry: { location: { lat: 37.123, lng: -122.456 } },
      vicinity: 'Walnut Creek, CA',
    }];
    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({ status: 'OK', results: fakeResult }),
    });
    const { nearbyPlaces } = require('./googlePlaces');
    const pois = await nearbyPlaces(37.123, -122.456, 61, { fetch: fakeFetch });
    expect(pois[0].category).toBe('trail');
  });

  it('should not override category if name does not match trail keywords', async () => {
    const fakeResult = [{
      place_id: 'def456',
      name: 'Lime Ridge Open Space',
      types: ['park'],
      geometry: { location: { lat: 37.124, lng: -122.457 } },
      vicinity: 'Walnut Creek, CA',
    }];
    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({ status: 'OK', results: fakeResult }),
    });
    const { nearbyPlaces } = require('./googlePlaces');
    const pois = await nearbyPlaces(37.124, -122.457, 61, { fetch: fakeFetch });
    expect(pois[0].category).toBe('park');
  });
});
