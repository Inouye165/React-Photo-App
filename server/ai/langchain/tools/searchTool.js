const { tool } = require('@langchain/core/tools');
const { z } = require('zod');
const logger = require('../../../logger'); // <-- ADDED IMPORT

const MAX_RESULTS = 8;

const ensureFetch = () => {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }

  return async (...args) => {
    const { default: fetchPolyfill } = await import('node-fetch');
    return fetchPolyfill(...args);
  };
};

const fetchFn = ensureFetch();

async function runGoogleSearch({ query, numResults = 4, siteFilter }) {
  logger.info('[searchTool] runGoogleSearch called', {
    query: query?.slice(0, 100),
    numResults,
    siteFilter: siteFilter || null,
  });

  const trimmedQuery = (query || '').trim();
  if (!trimmedQuery) {
    throw new Error('Search query is required');
  }

  const appliedResults = Math.max(1, Math.min(numResults, MAX_RESULTS));

  const apiKey = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;

  // [TEMPORARY DEBUG] Log only the last 4 chars of the API key to verify configuration
  // Remove this block once configuration is confirmed correct
  if (apiKey && apiKey.length >= 4) {
    const lastFour = apiKey.slice(-4);
    const endsWithEight = apiKey.endsWith('8');
    logger.info('[searchTool] Using Google Custom Search key ending with: ****' + lastFour, {
      endsWithEight,
      cxConfigured: !!cx,
    });
  } else if (!apiKey) {
    logger.warn('[searchTool] GOOGLE_API_KEY is missing or empty - search will fail or fallback to SerpAPI');
  } else {
    logger.warn('[searchTool] GOOGLE_API_KEY is too short (less than 4 chars) - likely misconfigured');
  }
  // [END TEMPORARY DEBUG]

  if (!apiKey || !cx) {
    const serpKey = process.env.SERPAPI_API_KEY;
    if (!serpKey) {
      throw new Error('Google Custom Search or SerpAPI credentials are not configured');
    }

    const serpParams = new URLSearchParams({
      engine: 'google',
      q: trimmedQuery,
      num: String(appliedResults),
      api_key: serpKey
    });

    if (siteFilter) serpParams.append('as_sitesearch', siteFilter);

    // --- ADDED TRY/CATCH ---
    try {
      const serpResponse = await fetchFn(`https://serpapi.com/search.json?${serpParams.toString()}`, {
        method: 'GET',
        headers: { 'User-Agent': 'CollectibleAgent/1.0 (+https://github.com/Inouye165/React-Photo-App)' }
      });

      if (!serpResponse.ok) {
        const text = await serpResponse.text();
        throw new Error(`SerpAPI search failed: ${serpResponse.status} ${text}`);
      }

      const serpJson = await serpResponse.json();
      const organic = Array.isArray(serpJson.organic_results) ? serpJson.organic_results : [];

      return organic.slice(0, appliedResults).map((result) => ({
        title: result.title || '',
        link: result.link || '',
        snippet: result.snippet || result.snippet_highlighted_words?.join(' ') || '',
        source: 'serpapi'
      }));
    } catch (error) {
      logger.error('[SearchTool] SerpAPI call failed:', error.message);
      // Return a string error message so the Agent can proceed with its internal knowledge
      return `Search failed: ${error.message}. Proceeding with internal knowledge only.`;
    }
    // --- END OF TRY/CATCH ---
  }

  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: trimmedQuery,
    num: String(appliedResults)
  });

  if (siteFilter) params.append('siteSearch', siteFilter);

  // --- ADDED TRY/CATCH ---
  try {
    logger.info('[SearchTool] Calling Google Custom Search API for query:', trimmedQuery);
    const response = await fetchFn(`https://www.googleapis.com/customsearch/v1?${params.toString()}`, {
      method: 'GET',
      headers: { 'User-Agent': 'CollectibleAgent/1.0 (+https://github.com/Inouye165/React-Photo-App)' }
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`Google Custom Search failed: ${response.status} ${bodyText}`);
    }

    const json = await response.json();
    const items = Array.isArray(json.items) ? json.items : [];

    logger.info('[SearchTool] Google Custom Search returned %d results for: %s', items.length, trimmedQuery);
    
    const results = items.slice(0, appliedResults).map((item) => ({
      title: item.title || '',
      link: item.link || '',
      snippet: item.snippet || '',
      displayLink: item.displayLink || '',
      mime: item.mime || undefined,
      source: 'google'
    }));
    
    // Log first result for debugging
    if (results.length > 0) {
      logger.info('[SearchTool] First result: %s - %s', results[0].title, results[0].link);
    }
    
    return results;
  } catch (error) {
    logger.error('[SearchTool] Google Custom Search call failed:', error.message);
    // Return a string error message so the Agent can proceed with its internal knowledge
    return `Search failed: ${error.message}. Proceeding with internal knowledge only.`;
  }
  // --- END OF TRY/CATCH ---
}

const googleSearchTool = tool(
  async ({ query, numResults, siteFilter }) => {
    const normalizedNumResults = numResults == null ? undefined : numResults;
    const normalizedSiteFilter = siteFilter == null ? undefined : siteFilter;
    const results = await runGoogleSearch({ query, numResults: normalizedNumResults, siteFilter: normalizedSiteFilter });
    return JSON.stringify({
      query,
      fetchedAt: new Date().toISOString(),
      results
    });
  },
  {
    name: 'google_collectible_search',
    description: 'Look up collectibles, identification markers, and recent sale values using Google Custom Search or SerpAPI.',
    schema: z.object({
      query: z.string().describe('Search keywords describing the collectible, include maker, era, serials, or distinctive traits.'),
      numResults: z.number().min(1).max(MAX_RESULTS).optional().nullable().describe('Maximum number of results to return.'),
      siteFilter: z.string().optional().nullable().describe('Optional site filter (domain) to narrow the search, e.g., worthpoint.com.')
    })
  }
);

module.exports = { googleSearchTool, runGoogleSearch };