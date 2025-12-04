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

  it('should deduplicate POIs with identical place_id from multiple type requests', async () => {
    // Simulate the same POI appearing in results for different types
    const sharedPOI = {
      place_id: 'duplicate_123',
      name: 'Central Park',
      types: ['park', 'tourist_attraction'],
      geometry: { location: { lat: 40.785, lng: -73.968 } },
      vicinity: 'New York, NY',
    };
    
    let callCount = 0;
    const fakeFetch = async (_url) => {
      callCount++;
      // Return the same POI for multiple type requests
      return {
        ok: true,
        json: async () => ({ status: 'OK', results: [sharedPOI] }),
      };
    };
    
    const { nearbyPlaces } = require('./googlePlaces');
    const pois = await nearbyPlaces(40.785, -73.968, 61, { fetch: fakeFetch });
    
    // Should make 4 requests (one per type: park, museum, tourist_attraction, natural_feature)
    expect(callCount).toBe(4);
    // But should return only 1 deduplicated result
    expect(pois.length).toBe(1);
    expect(pois[0].id).toBe('duplicate_123');
    expect(pois[0].name).toBe('Central Park');
  });

  it('should handle partial failures gracefully and return results from successful type requests', async () => {
    const parkPOI = {
      place_id: 'park_123',
      name: 'City Park',
      types: ['park'],
      geometry: { location: { lat: 37.5, lng: -122.3 } },
      vicinity: 'San Francisco, CA',
    };
    
    const fakeFetch = async (url) => {
      // Simulate failure for museum type, success for others
      if (url.includes('type=museum')) {
        return {
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        };
      }
      
      // Return park results for park type, empty for others
      if (url.includes('type=park')) {
        return {
          ok: true,
          json: async () => ({ status: 'OK', results: [parkPOI] }),
        };
      }
      
      return {
        ok: true,
        json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
      };
    };
    
    const { nearbyPlaces } = require('./googlePlaces');
    const pois = await nearbyPlaces(37.5, -122.3, 61, { fetch: fakeFetch });
    
    // Should still return the park result despite museum request failing
    expect(pois.length).toBe(1);
    expect(pois[0].name).toBe('City Park');
    expect(pois[0].category).toBe('park');
  });
});
