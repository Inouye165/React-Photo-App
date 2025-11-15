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
    expect(result.best_restaurant_candidate).toBeTruthy();
    expect(result.best_restaurant_candidate.name).toBe('Near Diner');
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
});
