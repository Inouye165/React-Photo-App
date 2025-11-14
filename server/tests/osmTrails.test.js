// Helper to load the module after configuring globals per test
function loadModule() {
  return require('../ai/poi/osmTrails');
}

describe('nearbyTrailsFromOSM', () => {
  const baseLat = 37.951783;
  const baseLon = -122.019303;

  beforeEach(() => {
    jest.resetModules();
    delete global.fetch;
  });

  it('normalizes OSM elements and sorts by distance', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: 'way',
              id: 1,
              center: { lat: baseLat + 0.01, lon: baseLon },
              tags: { name: 'Far Trail' },
            },
            {
              type: 'way',
              id: 2,
              center: { lat: baseLat + 0.001, lon: baseLon },
              tags: { name: 'Near Trail' },
            },
          ],
        }),
      })
    );

    const { nearbyTrailsFromOSM } = loadModule();
    const trails = await nearbyTrailsFromOSM(baseLat, baseLon, 2000);

    expect(trails).toHaveLength(2);
    expect(trails[0].name).toBe('Near Trail');
    expect(trails[0].category).toBe('trail');
    expect(trails[0].source).toBe('osm');
    expect(trails[0].distanceMeters).toBeLessThan(trails[1].distanceMeters);
  });

  it('caches repeated queries to avoid extra Overpass calls', async () => {
    const response = {
      ok: true,
      json: async () => ({ elements: [] }),
    };
    global.fetch = jest.fn(() => Promise.resolve(response));

    const { nearbyTrailsFromOSM } = loadModule();

    await nearbyTrailsFromOSM(baseLat, baseLon, 2000);
    await nearbyTrailsFromOSM(baseLat, baseLon, 2000);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array when Overpass responds with an error', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 429,
        text: async () => 'Too Many Requests',
      })
    );

    const { nearbyTrailsFromOSM } = loadModule();
    const trails = await nearbyTrailsFromOSM(baseLat, baseLon, 2000);

    expect(trails).toEqual([]);
  });
});
