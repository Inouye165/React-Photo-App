const axios = require('axios');
const crypto = require('crypto');
const supabase = require('../../../lib/supabaseClient');

/**
 * Performs Google Lens visual search using SerpApi.
 * Returns top 5 visual matches for grounding LLM identification in web data.
 * 
 * STRATEGY:
 * 1. Upload base64 image to Supabase Storage (temp file)
 * 2. Generate signed URL
 * 3. Call SerpApi with the URL (GET request)
 * 4. Cleanup temp file
 * 
 * This avoids 414 URI Too Long errors (GET with base64) and 404 errors (POST not supported).
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

  let tempPath = null;

  try {
    // 1. Prepare image buffer
    // Handle both raw base64 and data URI
    const match = imageBase64.match(/^data:(image\/[a-z]+);base64,/);
    const contentType = match ? match[1] : 'image/jpeg';
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    
    // 2. Upload to Supabase Storage (temp file)
    // Use 'photos' bucket as it's guaranteed to exist. Use a 'temp' folder.
    const randomId = crypto.randomBytes(16).toString('hex');
    const filename = `visual-search-${randomId}.jpg`;
    tempPath = `temp/${filename}`;

    console.log(`[VisualSearch] Uploading temp image to ${tempPath} (${buffer.length} bytes)`);

    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(tempPath, buffer, {
        contentType,
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // 3. Generate Signed URL (valid for 5 minutes)
    const { data: signedData, error: signError } = await supabase.storage
      .from('photos')
      .createSignedUrl(tempPath, 300);

    if (signError || !signedData?.signedUrl) {
      throw new Error(`Signed URL generation failed: ${signError?.message}`);
    }

    const imageUrl = signedData.signedUrl;
    console.log(`[VisualSearch] Generated signed URL for SerpApi`);

    // 4. Call SerpApi with the URL (GET request)
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        engine: 'google_lens',
        url: imageUrl,
        api_key: apiKey,
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
    if (axios.isAxiosError(error) && error.response) {
      console.error('[VisualSearch] SerpApi Response:', error.response.status, error.response.data);
    }
    return [];
  } finally {
    // 5. Cleanup temp file
    if (tempPath) {
      try {
        await supabase.storage.from('photos').remove([tempPath]);
        console.log(`[VisualSearch] Cleaned up temp file ${tempPath}`);
      } catch (cleanupError) {
        console.warn(`[VisualSearch] Failed to cleanup temp file: ${cleanupError.message}`);
      }
    }
  }
}

module.exports = { performVisualSearch };
