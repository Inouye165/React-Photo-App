const axios = require('axios');

/**
 * Performs Google Lens visual search using SerpApi.
 * Returns top 5 visual matches for grounding LLM identification in web data.
 * 
 * CRITICAL: Uses POST request to avoid Cloudflare 414 Request-URI Too Large errors.
 * The SerpApi library's getJson() defaults to GET which puts the base64 image in the URL.
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
    // Strip data URI prefix if present to minimize payload size
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    
    // MUST use POST to avoid 414 error - do NOT use SerpApi's getJson (uses GET)
    const response = await axios.post('https://serpapi.com/search', {
      engine: 'google_lens',
      image: cleanBase64,
      api_key: apiKey,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const matches = response.data?.visual_matches || [];
    
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
