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
  const trimmedQuery = (query || '').trim();
  if (!trimmedQuery) {
    throw new Error('Search query is required');
  }

  const appliedResults = Math.max(1, Math.min(numResults, MAX_RESULTS));

  const apiKey = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;

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
      // Re-throw the error so the agent knows it failed
      throw new Error(`Search tool failed: ${error.message}`);
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

    return items.slice(0, appliedResults).map((item) => ({
      title: item.title || '',
      link: item.link || '',
      snippet: item.snippet || '',
      displayLink: item.displayLink || '',
      mime: item.mime || undefined,
      source: 'google'
    }));
  } catch (error) {
    logger.error('[SearchTool] Google Custom Search call failed:', error.message);
    // Re-throw the error so the agent knows it failed
    throw new Error(`Search tool failed: ${error.message}`);
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