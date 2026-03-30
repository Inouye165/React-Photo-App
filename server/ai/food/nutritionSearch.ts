interface Logger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, ...args: unknown[]) => void;
}

interface NutritionData {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  notes: string;
}

interface SearchResult {
  title: string;
  snippet?: string;
}

const logger: Logger = require('../../logger');
const { runGoogleSearch } = require('../langchain/tools/searchTool');

async function fetchDishNutrition({ restaurantName, dishName }: { restaurantName?: string; dishName: string }): Promise<NutritionData | null> {
  const query = `${restaurantName ? restaurantName + ' ' : ''}${dishName} nutrition facts`; // e.g., "Chez Panisse mushroom risotto nutrition facts"
  logger.info('[nutritionSearch] Attempting nutrition lookup for:', { query });
  try {
    const resp: string = await runGoogleSearch({ query, numResults: 4 });
    const parsed: { results?: SearchResult[] } = JSON.parse(resp || '{}');
    const results: SearchResult[] = parsed.results || [];
    if (!results.length) {
      logger.info('[nutritionSearch] No search results for nutrition lookup');
      return null;
    }

    // Aggregate snippets to try to find nutrition numbers
    const combinedText: string = results.map((r: SearchResult) => `${r.title} ${r.snippet || ''}`).join('\n');
    const caloriesMatch: RegExpMatchArray | null = combinedText.match(/(\bcalories?\b|\bkcal\b)\s*[:\s]*([0-9]{2,4})/i);
    const proteinMatch: RegExpMatchArray | null = combinedText.match(/protein\s*[:\s]*([0-9]{1,3})\s*g/i);
    const carbsMatch: RegExpMatchArray | null = combinedText.match(/carb[s]?\s*[:\s]*([0-9]{1,3})\s*g/i);
    const fatMatch: RegExpMatchArray | null = combinedText.match(/fat\s*[:\s]*([0-9]{1,3})\s*g/i);

    const calories: number | null = caloriesMatch ? Number(caloriesMatch[2]) : null;
    const protein_g: number | null = proteinMatch ? Number(proteinMatch[1]) : null;
    const carbs_g: number | null = carbsMatch ? Number(carbsMatch[1]) : null;
    const fat_g: number | null = fatMatch ? Number(fatMatch[1]) : null;

    if (!calories && !protein_g && !carbs_g && !fat_g) {
      logger.info('[nutritionSearch] No structured nutrition found; falling back to notes');
      return { calories: null, protein_g: null, carbs_g: null, fat_g: null, notes: 'No explicit nutrition numbers found.' };
    }

    const out: NutritionData = { calories, protein_g, carbs_g, fat_g, notes: `Found data from search for '${query}'` };
    logger.info('[nutritionSearch] Parsed nutrition', { summary: out as unknown as Record<string, unknown> });
    return out;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn('[nutritionSearch] Search tool failed or API key missing', errMsg);
    return null; // allow callers to fallback to estimation
  }
}

module.exports = { fetchDishNutrition };

export { fetchDishNutrition };
