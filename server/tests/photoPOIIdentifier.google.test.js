jest.mock('openai', () => {
  return function OpenAI() {
    return { chat: { completions: { create: jest.fn() } } };
  };
});

jest.mock('../ai/langchain/geolocateTool', () => ({
  geolocate: jest.fn()
}));

jest.mock('../ai/langchain/tools/googlePlacesTool', () => {
  const fetchGooglePlaces = jest.fn();
  return {
    fetchGooglePlaces,
    googlePlacesTool: { name: 'google_places_search' }
  };
});

jest.mock('../ai/langchain/tools/searchTool', () => ({
  googleSearchTool: {
    invoke: jest.fn().mockResolvedValue(JSON.stringify({ query: '', results: [] }))
  }
}));

const { geolocate } = require('../ai/langchain/geolocateTool');
const { fetchGooglePlaces } = require('../ai/langchain/tools/googlePlacesTool');
const { PhotoPOIIdentifierNode, normalizeAICategories } = require('../ai/langchain/photoPOIIdentifier');

describe('PhotoPOIIdentifier integration with Google Places', () => {
  test('prioritizes Google Places business for restaurant scenes', async () => {
    geolocate.mockResolvedValue({
      nearby: [
        {
          name: 'OSM Grill',
          lat: 37.7749,
          lon: -122.4194,
          tags: { amenity: 'restaurant' }
        }
      ]
    });

    fetchGooglePlaces.mockResolvedValue([
      {
        name: "Sam's Seafood",
        lat: 37.775,
        lon: -122.4195,
        rating: 4.6,
        types: ['restaurant', 'food']
      }
    ]);

    const identifier = new PhotoPOIIdentifierNode('test-key');
    identifier.analyzeImage = jest.fn().mockResolvedValue({
      scene_type: 'restaurant',
      confidence: 'high',
      visual_elements: ['plates of seafood'],
      likely_categories: ['restaurant'],
      distinctive_features: [],
      has_ocean_view: false,
      has_mountain_view: false,
      has_water_feature: false,
      indoor_outdoor: 'indoor',
      time_of_day: 'evening',
      visible_text: ["Sam's Seafood"],
      search_keywords: ['seafood'],
      business_name: "Sam's Seafood"
    });

    const result = await identifier.identifyPOI('fake-image-data', 37.7749, -122.4194);

    expect(fetchGooglePlaces).toHaveBeenCalledWith(
      expect.objectContaining({
        gpsString: expect.stringContaining('37.7749'),
        radiusMeters: expect.any(Number)
      })
    );

    expect(result.poi_list[0].name).toBe("Sam's Seafood");
    expect(result.poi_list[0].source).toBe('google_places');
    expect(result.best_match.name).toBe("Sam's Seafood");
  });
});

describe('Category Normalization Regression Test', () => {
  test('should convert unsupported "nature reserve" to "park" to prevent API 400 error', () => {
    const categories = ['restaurant', 'nature reserve', 'river', 'park'];
    const expectedResultContains = ['park', 'restaurant'];

    const result = normalizeAICategories(categories);

    expect(result).toEqual(expect.arrayContaining(expectedResultContains));
    expect(result).not.toContain('nature reserve');
  });

  test('should filter out generic terms and handle duplicates correctly', () => {
    const categories = ['nature reserve', 'mountain', 'restaurant', 'park', 'river', 'restaurant'];
    const expected = ['park', 'restaurant'];

    const result = normalizeAICategories(categories).sort();

    expect(result).toEqual(expected.sort());
    expect(result.length).toBe(2);
  });
});
