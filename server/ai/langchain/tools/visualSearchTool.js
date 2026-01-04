const { getJson } = require('serpapi');

/**
 * Performs Google Lens visual search using SerpApi.
 * Returns top 5 visual matches for grounding LLM identification in web data.
 * 
 * @param {string} imageBase64 Base64-encoded image without data URI prefix
 * @returns {Promise<Array<{title: string, link: string, thumbnail: string, source: string}>>} Visual matches (empty array on error)
 */
async function performVisualSearch(imageBase64) {
  const apiKey = process.env.SERPAPI_API_KEY;
  
  if (!apiKey) {
    console.warn('[VisualSearch] SERPAPI_API_KEY not configured; skipping visual search');
    return [];
  }

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    console.warn('[VisualSearch] Invalid image input; skipping visual search');
    return [];
  }

  try {
    // Use 'image' parameter instead of 'url' to avoid 414 error
    // SerpApi accepts base64 directly in the 'image' field for POST requests
    const response = await getJson({
      engine: 'google_lens',
      image: imageBase64,  // Send base64 directly, not as data URI
      api_key: apiKey,
    });

    const matches = response.visual_matches || [];
    
    // Filter and normalize top 5 results
    const visualMatches = matches
      .slice(0, 5)
      .filter(m => m.title && m.link)
      .map(m => ({
        title: m.title,
        link: m.link,
        thumbnail: m.thumbnail || '',
        source: m.source || '',
      }));

    console.log(`[VisualSearch] Found ${visualMatches.length} visual matches`);
    return visualMatches;

  } catch (error) {
    // Log error but return empty array so graph can proceed with LLM-only fallback
    console.error('[VisualSearch] API error:', error instanceof Error ? error.message : error);
    return [];
  }
}

module.exports = { performVisualSearch };
