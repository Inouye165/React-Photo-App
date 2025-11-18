jest.mock('../../poi/googlePlaces', () => ({ reverseGeocode: jest.fn(), nearbyPlaces: jest.fn() }));
jest.mock('../../poi/foodPlaces', () => ({ nearbyFoodPlaces: jest.fn() }));
jest.mock('../../poi/osmTrails', () => ({ nearbyTrailsFromOSM: jest.fn() }));
jest.mock('../../openaiClient', () => ({ openai: { chat: { completions: { create: jest.fn() } } } }));

const { openai } = require('../../openaiClient');
const { reverseGeocode, nearbyPlaces } = require('../../poi/googlePlaces');
const { nearbyFoodPlaces } = require('../../poi/foodPlaces');
const { nearbyTrailsFromOSM } = require('../../poi/osmTrails');

describe('Collect context graph integration', () => {
  beforeEach(() => jest.resetAllMocks());

  it('runs collect_context and uses cached values in subsequent nodes', async () => {
    // Stage responses
    openai.chat.completions.create
      // classify_image -> classification
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ classification: 'food' }) } }] })
      // location_intelligence_agent -> location intel
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ city: 'Test City', region: 'CA', nearest_landmark: 'Test Park', nearest_park: 'Test Park', nearest_trail: 'unknown', description_addendum: 'test' }) } }] })
      // food_metadata_agent -> model metadata
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ caption: 'Caption', description: 'A dish', dish_name: 'Noodle', keywords: ['noodle'] }) } }] });

    reverseGeocode.mockResolvedValueOnce({ address: '123 Food St' });
    // classification=food means skip generic POI in lexgraph; collect_context still should fetch nearbyFood
    nearbyPlaces.mockResolvedValueOnce([]);
    nearbyFoodPlaces.mockResolvedValueOnce([{ placeId: 'p1', name: 'Food Place', address: '123 Food St' }]);
    nearbyTrailsFromOSM.mockResolvedValueOnce([]);

    const { app } = require('../graph');
    // Build a minimal initial state
    const initialState = {
      filename: 'run.jpg',
      imageBase64: 'FAKE',
      imageMime: 'image/jpeg',
      metadata: {},
      gpsString: '37.123,-122.456',
      classification: null,
      poiAnalysis: null,
      finalResult: null,
      debugUsage: [],
    };

    // Try common run methods on compiled graph
    let runFn = app.run || app.execute || app.start || app.invoke || app.call || app;
    if (typeof runFn === 'function') runFn = runFn.bind(app);
    const result = await runFn(initialState);

    expect(result.poiCache).toBeTruthy();
    expect(result.poiCache.nearbyFood.length).toBeGreaterThanOrEqual(1);
    // food_location_agent should see cached nearbyFood and set best_restaurant_candidate
    expect(result.poiAnalysis).toBeTruthy();
    expect(result.finalResult).toBeTruthy();
  });
});
