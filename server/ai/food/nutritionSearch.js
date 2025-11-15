const logger = require('../../logger');
const { runGoogleSearch } = require('../langchain/tools/searchTool');

async function fetchDishNutrition({ restaurantName, dishName }) {
  const query = `${restaurantName ? restaurantName + ' ' : ''}${dishName} nutrition facts`; // e.g., "Chez Panisse mushroom risotto nutrition facts"
  logger.info('[nutritionSearch] Attempting nutrition lookup for:', { query });
  try {
    const resp = await runGoogleSearch({ query, numResults: 4 });
    const parsed = JSON.parse(resp || '{}');
    const results = parsed.results || [];
    if (!results.length) {
      logger.info('[nutritionSearch] No search results for nutrition lookup');
      return null;
    }

    // Aggregate snippets to try to find nutrition numbers
    const combinedText = results.map((r) => `${r.title} ${r.snippet || ''}`).join('\n');
    const caloriesMatch = combinedText.match(/(\bcalories?\b|\bkcal\b)\s*[:\s]*([0-9]{2,4})/i);
    const proteinMatch = combinedText.match(/protein\s*[:\s]*([0-9]{1,3})\s*g/i);
    const carbsMatch = combinedText.match(/carb[s]?\s*[:\s]*([0-9]{1,3})\s*g/i);
    const fatMatch = combinedText.match(/fat\s*[:\s]*([0-9]{1,3})\s*g/i);

    const calories = caloriesMatch ? Number(caloriesMatch[2]) : null;
    const protein_g = proteinMatch ? Number(proteinMatch[1]) : null;
    const carbs_g = carbsMatch ? Number(carbsMatch[1]) : null;
    const fat_g = fatMatch ? Number(fatMatch[1]) : null;

    if (!calories && !protein_g && !carbs_g && !fat_g) {
      logger.info('[nutritionSearch] No structured nutrition found; falling back to notes');
      return { calories: null, protein_g: null, carbs_g: null, fat_g: null, notes: 'No explicit nutrition numbers found.' };
    }

    const out = { calories, protein_g, carbs_g, fat_g, notes: `Found data from search for '${query}'` };
    logger.info('[nutritionSearch] Parsed nutrition', { summary: out });
    return out;
  } catch (err) {
    logger.warn('[nutritionSearch] Search tool failed or API key missing', err && err.message ? err.message : err);
    return null; // allow callers to fallback to estimation
  }
}

module.exports = { fetchDishNutrition };
