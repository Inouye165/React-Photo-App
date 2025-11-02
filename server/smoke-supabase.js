// Non-blocking Supabase smoke-check used at server startup.
// Performs a harmless read (list buckets or a small select) and logs success/failure.
const logger = require('./logger');

module.exports = async function runSupabaseSmoke(supabaseClient) {
  try {
    // Allow injection for testing; otherwise require the configured client
    if (!supabaseClient) {
      supabaseClient = require('./lib/supabaseClient');
    }

    // If the client is a proxy that throws on access, accessing a method will
    // throw and be caught below with a helpful message already emitted earlier.

    // Prefer storage listBuckets as a harmless server-side read
    if (supabaseClient && supabaseClient.storage && typeof supabaseClient.storage.listBuckets === 'function') {
      const { data, error } = await supabaseClient.storage.listBuckets();
      if (error) {
        logger.warn('[supabase-smoke] storage.listBuckets returned error:', error.message || error);
        return false;
      }
      logger.info('[supabase-smoke] Supabase storage reachable — buckets:', Array.isArray(data) ? data.length : 'unknown');
      return true;
    }

    // Fallback: try a small DB select on the `photos` table (non-destructive)
    if (supabaseClient && typeof supabaseClient.from === 'function') {
      const res = await supabaseClient.from('photos').select('id').limit(1);
      const error = res && res.error;
      if (error) {
        logger.warn('[supabase-smoke] db select returned error:', error.message || error);
        return false;
      }
      logger.info('[supabase-smoke] Supabase DB reachable (photos table OK)');
      return true;
    }

    logger.warn('[supabase-smoke] Supabase client does not expose storage.listBuckets or from(). Skipping smoke-check.');
    return false;
  } catch (err) {
    logger.warn('[supabase-smoke] Exception during smoke-check:', err && err.message ? err.message : err);
    return false;
  }
};
