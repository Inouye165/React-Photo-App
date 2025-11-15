jest.mock('../langchain/tools/searchTool', () => ({
  runGoogleSearch: jest.fn()
}));
const { runGoogleSearch } = require('../langchain/tools/searchTool');
const { fetchDishNutrition } = require('./nutritionSearch');

describe('nutritionSearch.fetchDishNutrition', () => {
  beforeEach(() => jest.resetAllMocks());
  it('returns parsed nutrition values when snippets include structure', async () => {
    runGoogleSearch.mockResolvedValueOnce(JSON.stringify({ results: [ { title: 'Menu - Good Eats', snippet: 'Calories 650 · Protein 45g · Fat 25g · Carbs 56g' } ] }));
    const out = await fetchDishNutrition({ restaurantName: 'Good Eats', dishName: 'Grilled Salmon' });
    expect(out).toBeTruthy();
    expect(out.calories).toBe(650);
    expect(out.protein_g).toBe(45);
    expect(out.fat_g).toBe(25);
    expect(out.carbs_g).toBe(56);
  });

  it('returns null when runGoogleSearch throws (no API key)', async () => {
    runGoogleSearch.mockRejectedValueOnce(new Error('No credentials')); 
    const out = await fetchDishNutrition({ restaurantName: 'NoKey', dishName: 'Mystery Dish' });
    expect(out).toBeNull();
  });
});
