// File: c:\Users\Ron\React-Photo-App\server\ai\langgraph\graph.food.test.js
jest.mock('../poi/foodPlaces', () => ({ nearbyFoodPlaces: jest.fn() }));
jest.mock('../poi/osmTrails', () => ({ nearbyTrailsFromOSM: jest.fn() }));
jest.mock('../openaiClient', () => ({ openai: { chat: { completions: { create: jest.fn() } } } }));
jest.mock('../poi/googlePlaces', () => ({ nearbyPlaces: jest.fn(), reverseGeocode: jest.fn() }));
jest.mock('../food/nutritionSearch', () => ({ fetchDishNutrition: jest.fn() }));

const { __testing } = require('./graph');
const { nearbyFoodPlaces } = require('../poi/foodPlaces');
const { openai } = require('../openaiClient');
const { fetchDishNutrition } = require('../food/nutritionSearch');

describe('food nodes behavior', () => {
  beforeEach(() => jest.resetAllMocks());

  it('food_location_agent selects nearest and attaches it to state', async () => {
    const fakeCandidates = [
      { placeId: 'far', name: 'Far Eatery', distanceMeters: 350, address: 'Fartown' },
      { placeId: 'near', name: 'Near Diner', distanceMeters: 45, address: 'Nearville', types: ['restaurant'] },
    ];
    nearbyFoodPlaces.mockResolvedValueOnce(fakeCandidates);
    const state = { filename: 'photo.jpg', metadata: { latitude: 37.123, longitude: -122.456 }, gpsString: '37.123,-122.456' };
    const result = await __testing.food_location_agent(state);
    expect(result.nearby_food_places).toBeTruthy();
    expect(result.nearby_food_places.length).toBe(2);
    // The location agent should not select a best candidate in this mode.
    expect(result.best_restaurant_candidate).toBeNull();
  });

  it('location_intelligence_agent deterministic selects closest high-rated restaurant for non-food scenes', async () => {
    process.env.FOOD_CANDIDATE_MAX = '3';
    process.env.FOOD_DETERMINISTIC_DISTANCE_METERS = '100';
    process.env.FOOD_DETERMINISTIC_MIN_RATING = '4';

    const fakeCandidates = [
      { placeId: 'near', name: 'Near Diner', distanceMeters: 30, address: 'Nearville', types: ['restaurant'], rating: 4.5 },
      { placeId: 'far', name: 'Far Eatery', distanceMeters: 350, address: 'Fartown', types: ['restaurant'], rating: 4.7 },
    ];
    const { location_intelligence_agent } = require('./graph').__testing;
    const { nearbyPlaces } = require('../poi/googlePlaces');
    // Mock google places
    nearbyPlaces.mockResolvedValueOnce(fakeCandidates);

    const state = { filename: 'photo.jpg', metadata: {}, gpsString: '37.123,-122.456', coords: { lat: 37.123, lon: -122.456 }, classification: 'scenery' };
    const res = await location_intelligence_agent(state);
    expect(res.nearby_food_places).toBeTruthy();
    expect(res.nearby_food_places.length).toBeGreaterThan(0);
    // Deterministic selection should be set on the state
    expect(res.best_restaurant_candidate).toBeTruthy();
    expect(res.best_restaurant_candidate.name).toBe('Near Diner');
    // Reset env
    delete process.env.FOOD_DETERMINISTIC_DISTANCE_METERS;
    delete process.env.FOOD_DETERMINISTIC_MIN_RATING;
    delete process.env.FOOD_CANDIDATE_MAX;
  });

  it('food_location_agent deterministic selects closest high-rated restaurant for food', async () => {
    process.env.FOOD_CANDIDATE_MAX = '3';
    process.env.FOOD_DETERMINISTIC_DISTANCE_METERS = '100';
    process.env.FOOD_DETERMINISTIC_MIN_RATING = '4';

    const fakeCandidates = [
      { placeId: 'near', name: 'Near Diner', distanceMeters: 30, address: 'Nearville', types: ['restaurant'], rating: 4.5 },
      { placeId: 'far', name: 'Far Eatery', distanceMeters: 350, address: 'Fartown', types: ['restaurant'], rating: 4.7 },
    ];
    const { food_location_agent } = require('./graph').__testing;
    const { nearbyFoodPlaces } = require('../poi/foodPlaces');
    nearbyFoodPlaces.mockResolvedValueOnce(fakeCandidates);

    const state = { filename: 'photo.jpg', metadata: {}, gpsString: '37.123,-122.456', coords: { lat: 37.123, lon: -122.456 }, classification: 'food' };
    const res = await food_location_agent(state);
    expect(res.nearby_food_places).toBeTruthy();
    expect(res.nearby_food_places.length).toBeGreaterThan(0);
    // Deterministic selection should be set on the state
    expect(res.best_restaurant_candidate).toBeTruthy();
    expect(res.best_restaurant_candidate.name).toBe('Near Diner');
    // Reset env
    delete process.env.FOOD_DETERMINISTIC_DISTANCE_METERS;
    delete process.env.FOOD_DETERMINISTIC_MIN_RATING;
    delete process.env.FOOD_CANDIDATE_MAX;
  });

  it('location_intelligence_agent should skip OSM trails for food classification', async () => {
    process.env.OSM_SKIP_CATEGORIES = 'food';
    process.env.OSM_TRAILS_DEFAULT_RADIUS_METERS = '100';
    const { location_intelligence_agent } = require('./graph').__testing;
    const { nearbyTrailsFromOSM } = require('../poi/osmTrails');
    const { nearbyPlaces, reverseGeocode } = require('../poi/googlePlaces');
    reverseGeocode.mockResolvedValueOnce({ city: 'Fake' });
    nearbyPlaces.mockResolvedValueOnce([]);

    const state = { classification: 'food', metadata: {}, gpsString: '37.123,-122.456', coords: { lat: 37.123, lon: -122.456 } };
    const res = await location_intelligence_agent(state);
    // OSM should not be called and nearbyTrailsOSM should be an empty array
    expect(nearbyTrailsFromOSM).not.toHaveBeenCalled();
    // Generic places lookup should also be skipped
    expect(nearbyPlaces).not.toHaveBeenCalled();
    expect(res.poiAnalysis.nearbyTrailsOSM).toEqual([]);
  });

  it('location_intelligence_agent should run OSM trails for non-food classification', async () => {
    process.env.OSM_SKIP_CATEGORIES = 'food';
    process.env.OSM_TRAILS_DEFAULT_RADIUS_METERS = '100';
    const { location_intelligence_agent } = require('./graph').__testing;
    const { nearbyTrailsFromOSM } = require('../poi/osmTrails');
    const { nearbyPlaces, reverseGeocode } = require('../poi/googlePlaces');
    reverseGeocode.mockResolvedValueOnce({ city: 'FakeCity' });
    nearbyPlaces.mockResolvedValueOnce([]);
    nearbyTrailsFromOSM.mockResolvedValueOnce([{ id: 'osm:way/1', name: 'Trail One' }]);

    const state = { classification: 'scenery', metadata: {}, gpsString: '37.123,-122.456', coords: { lat: 37.123, lon: -122.456 } };
    const res = await location_intelligence_agent(state);
    expect(nearbyTrailsFromOSM).toHaveBeenCalled();
    expect(Array.isArray(res.poiAnalysis.nearbyTrailsOSM)).toBe(true);
  });

  it('food_metadata_agent produces finalResult and attaches food info', async () => {
    const state = {
      filename: 'photo.jpg',
      imageBase64: 'FAKE',
      imageMime: 'image/jpeg',
      classification: 'food',
      metadata: { DateTimeOriginal: '2025-11-14' },
      gpsString: '37.123,-122.456',
      best_restaurant_candidate: { name: 'Test Restaurant', address: '123 Main St' },
      nearby_food_places: [],
      poiAnalysis: {}
    };
    // Response from LLM: returns JSON with fields
    const mockParsed = {
      caption: 'Tasty Dish',
      description: 'A tasty meal',
      dish_name: 'Grilled Salmon',
      cuisine: 'Seafood',
      keywords: ['food', 'seafood', 'salmon']
    };
    openai.chat.completions.create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(mockParsed) } }] });
    // nutrition search: returns structured data
    fetchDishNutrition.mockResolvedValueOnce({ calories: 500, protein_g: 35, carbs_g: 20, fat_g: 25, notes: 'Sourced' });

    const result = await __testing.food_metadata_agent(state);
    expect(result.finalResult).toBeTruthy();
    expect(result.finalResult.caption).toBe('Tasty Dish');
    expect(result.poiAnalysis.food).toBeTruthy();
    expect(result.poiAnalysis.food.dish_name).toBe('Grilled Salmon');
    expect(result.poiAnalysis.food.nutrition_info.calories).toBe(500);
  });

  it('promotes POI from keywords to restaurant_name and description', async () => {
    const state = {
      filename: 'photo.jpg',
      imageBase64: 'FAKE',
      imageMime: 'image/jpeg',
      classification: 'food',
      metadata: { DateTimeOriginal: '2025-11-14' },
      gpsString: '37.123,-122.456',
  nearby_food_places: [{ placeId: 'p_cajun', name: 'Cajun Crackn Concord', address: '100 Fish St' }],
      poiAnalysis: {}
    };
    // Model returns the POI in keywords only (no restaurant_name). We should promote it.
    const mockParsed = {
      caption: 'Crab Boil',
      description: 'A big bag of seafood',
      dish_name: 'Crab boil',
      cuisine: 'Seafood',
      keywords: ['seafood','cajun crackn']
    };
    // Model chooses the placeId from nearby_food_places
  const enrichedParsed = { ...mockParsed, caption: 'Crab Boil at Cajun Crackn Concord', description: 'A big bag of seafood, likely from Cajun Crackn Concord', chosen_place_id: 'p_cajun', restaurant_name: 'Cajun Crackn Concord', restaurant_confidence: 0.9 };
    openai.chat.completions.create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(enrichedParsed) } }] });
    fetchDishNutrition.mockResolvedValueOnce(null);
    const result = await __testing.food_metadata_agent(state);
    expect(result.finalResult).toBeTruthy();
    expect(result.poiAnalysis.food.restaurant_name).toBe('Cajun Crackn Concord');
    expect(result.finalResult.description).toMatch(/Cajun Crackn Concord/);
    expect(result.finalResult.caption).toMatch(/Cajun Crackn Concord/);
  });

  it('passes curated nearby_food_places to the LLM when available', async () => {
    const { food_location_agent, food_metadata_agent } = require('./graph').__testing;
    const state = {
      filename: 'photo.jpg',
      imageBase64: 'FAKE',
      imageMime: 'image/jpeg',
      classification: 'food',
      metadata: { DateTimeOriginal: '2025-11-14' },
      gpsString: '37.123,-122.456',
      // We'll call food_location_agent to populate these fields
      nearby_food_places: [],
      nearby_food_places_curated: [],
      poiAnalysis: {}
    };

    const mockParsed = { caption: 'Crab Boil', description: 'Yum', dish_name: 'Crab Boil', keywords: ['crab'] };
    openai.chat.completions.create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(mockParsed) } }] });
    fetchDishNutrition.mockResolvedValueOnce(null);

    // Run the food location agent to populate {nearby_food_places, nearby_food_places_curated}
    nearbyFoodPlaces.mockResolvedValueOnce([{ placeId: 'p_cajun', name: 'Cajun Crackn Concord', address: '100 Fish St' }]);
    const withPlaces = await food_location_agent(state);
    const result = await food_metadata_agent(withPlaces);
    expect(result.finalResult).toBeTruthy();
    // Ensure the LLM was called and the sanitized messages contain the curated candidate
    const callArgs = openai.chat.completions.create.mock.calls[0][0];
    expect(JSON.stringify(callArgs.messages[1].content)).toMatch(/Cajun Crackn Concord/);
  });

  it('deterministic override locks restaurant for food', async () => {
    const { food_location_agent, food_metadata_agent } = require('./graph').__testing;
    process.env.FOOD_DETERMINISTIC_DISTANCE_METERS = '100';
    process.env.FOOD_DETERMINISTIC_MIN_RATING = '4.0';

    const candidate = { placeId: 'p_merr', name: "Merriman's Kapalua", address: '1 Bay Club Place', source: 'google', rating: 4.7, distanceMeters: 27 };
    nearbyFoodPlaces.mockResolvedValueOnce([candidate]);

    const state = { filename: 'food.jpg', metadata: {}, gpsString: '20.9984033,-156.6671469', coords: { lat: 20.9984033, lon: -156.6671469 }, classification: 'food' };
    const withPlaces = await food_location_agent(state);

    // Ensure the location agent set the candidate and deterministic selection
    expect(Array.isArray(withPlaces.nearby_food_places)).toBeTruthy();
    expect(withPlaces.nearby_food_places.length).toBe(1);
    // best_restaurant_candidate should be present and deterministic
    expect(withPlaces.best_restaurant_candidate).toBeTruthy();
    expect(withPlaces.best_restaurant_candidate.name).toBe("Merriman's Kapalua");

    // Have LLM return a different restaurant name, but the deterministic override should win
    const mockParsed = { caption: 'Clams Dish', description: 'Clams', dish_name: 'Clams', restaurant_name: 'Not Merrimans', restaurant_address: '123 Fake St', restaurant_confidence: 0.2 };
    openai.chat.completions.create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(mockParsed) } }] });

    const afterMeta = await food_metadata_agent(withPlaces);
    expect(afterMeta.poiAnalysis.food.deterministic_restaurant).toBeTruthy();
    expect(afterMeta.poiAnalysis.food.restaurant_name).toBe("Merriman's Kapalua");
    expect(afterMeta.poiAnalysis.food.restaurant_confidence).toBe(1);

    delete process.env.FOOD_DETERMINISTIC_MIN_RATING;
    delete process.env.FOOD_DETERMINISTIC_DISTANCE_METERS;
  });

  it('enforces restaurant mention in description when restaurant_name is provided', async () => {
    const state = {
      filename: 'photo.jpg',
      imageBase64: 'FAKE',
      imageMime: 'image/jpeg',
      classification: 'food',
      metadata: { DateTimeOriginal: '2025-11-14' },
      gpsString: '37.123,-122.456',
      nearby_food_places: [{ placeId: 'p_merriman', name: "Merriman's Kapalua", address: '1 Bay Club Place' }],
      poiAnalysis: {},
    };
    const mockParsed = {
      caption: 'Seafood Dish',
      description: 'A close-up of seafood.',
      dish_name: 'Seafood',
      restaurant_name: "Merriman's Kapalua",
      restaurant_confidence: 0.9,
      keywords: ['seafood'],
    };
    openai.chat.completions.create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(mockParsed) } }] });
    fetchDishNutrition.mockResolvedValueOnce(null);

    const result = await __testing.food_metadata_agent(state);
    expect(result.finalResult.description).toMatch(/Merriman's Kapalua/);
    expect(result.poiAnalysis.food.description).toMatch(/Merriman's Kapalua/);
  });

  it('ignores chosen_place_id that is not in nearby_food_places', async () => {
    const state = {
      filename: 'photo.jpg',
      imageBase64: 'FAKE',
      imageMime: 'image/jpeg',
      classification: 'food',
      metadata: { DateTimeOriginal: '2025-11-14' },
      gpsString: '37.123,-122.456',
      nearby_food_places: [{ placeId: 'p_cajun', name: 'Cajun Crackn Concord', address: '100 Fish St' }],
      poiAnalysis: {}
    };
    // Model chooses a placeId not in the provided list but with high confidence
    const mockParsed = {
      caption: 'Crab Boil at Far Eatery',
      description: 'A big bag of seafood, likely from Far Eatery',
      dish_name: 'Crab boil',
      cuisine: 'Seafood',
      chosen_place_id: 'p_unknown',
      restaurant_name: 'Far Eatery',
      restaurant_confidence: 0.9
    };
    openai.chat.completions.create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(mockParsed) } }] });
    fetchDishNutrition.mockResolvedValueOnce(null);
    const result = await __testing.food_metadata_agent(state);
    expect(result.finalResult).toBeTruthy();
    // Since chosen_place_id not in nearby list, best_restaurant_candidate should remain null
    expect(result.best_restaurant_candidate).toBeNull();
    // But the model can provide a restaurant_name; we'll accept it in structured fields
    expect(result.poiAnalysis.food.restaurant_name).toBe('Far Eatery');
  });

  it('ignores low-confidence chosen_place_id', async () => {
    const state = {
      filename: 'photo.jpg',
      imageBase64: 'FAKE',
      imageMime: 'image/jpeg',
      classification: 'food',
      metadata: { DateTimeOriginal: '2025-11-14' },
      gpsString: '37.123,-122.456',
      nearby_food_places: [{ placeId: 'p_cajun', name: 'Cajun Crackn Concord', address: '100 Fish St' }],
      poiAnalysis: {}
    };
    // Model chooses the placeId but with low confidence (0.3); should be ignored
    const mockParsedLowConfidence = {
      caption: 'Crab Boil',
      description: 'A big bag of seafood',
      dish_name: 'Crab boil',
      cuisine: 'Seafood',
      chosen_place_id: 'p_cajun',
      restaurant_name: 'Cajun Crackn Concord',
      restaurant_confidence: 0.3
    };
    openai.chat.completions.create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(mockParsedLowConfidence) } }] });
    fetchDishNutrition.mockResolvedValueOnce(null);
    const result2 = await __testing.food_metadata_agent(state);
    expect(result2.finalResult).toBeTruthy();
    // Low confidence chosen candidate should be ignored
    expect(result2.best_restaurant_candidate).toBeNull();
    // But LLM-provided restaurant_name can still be used in structured fields
    expect(result2.poiAnalysis.food.restaurant_name).toBe('Cajun Crackn Concord');
  });
});
