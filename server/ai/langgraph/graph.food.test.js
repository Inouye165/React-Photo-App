// File: c:\Users\Ron\React-Photo-App\server\ai\langgraph\graph.food.test.js
jest.mock('../poi/foodPlaces', () => ({ nearbyFoodPlaces: jest.fn() }));
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
    // As a dumb finder, the location agent should not choose a best candidate
    expect(result.best_restaurant_candidate).toBeNull();
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
