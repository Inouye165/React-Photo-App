// Non-blocking Supabase smoke-check used at server startup.
// Performs a harmless read (list buckets or a small select) and logs success/failure.
const logger = require('./logger');

const WARN_THROTTLE_MS = Number(process.env.SUPABASE_SMOKE_WARN_THROTTLE_MS) || 60_000;
const channelState = new Map();

function getState(channel) {
  if (!channelState.has(channel)) {
    channelState.set(channel, {
      consecutiveFailures: 0,
      suppressed: 0,
      lastWarnTime: 0,
      lastWarnMessage: null,
      hadSuccess: false,
    });
  }
  return channelState.get(channel);
}

function logFailure(channel, message, ...args) {
  const state = getState(channel);
  state.consecutiveFailures += 1;
  const now = Date.now();
  const normalized = typeof message === 'string' ? message : JSON.stringify(message);
  if (state.lastWarnMessage !== normalized) {
    state.lastWarnMessage = normalized;
    state.lastWarnTime = 0;
    state.suppressed = 0;
  }
  if (!state.lastWarnTime || now - state.lastWarnTime >= WARN_THROTTLE_MS) {
    if (state.suppressed > 0) {
      logger.warn(
        `[supabase-smoke] ${channel} error repeated ${state.suppressed} additional time${state.suppressed === 1 ? '' : 's'} while suppressed`
      );
    }
    logger.warn(message, ...args);
    state.lastWarnTime = now;
    state.suppressed = 0;
  } else {
    state.suppressed += 1;
    if (typeof logger.isLevelEnabled === 'function' && logger.isLevelEnabled('debug')) {
      const plural = state.suppressed === 1 ? '' : 's';
      logger.debug(
        `[supabase-smoke] suppressed ${channel} warning (${state.suppressed} duplicate${plural} within ${WARN_THROTTLE_MS}ms window)`
      );
    }
  }
}

function logSuccess(channel, message, ...args) {
  const state = getState(channel);
  if (state.consecutiveFailures > 0) {
    logger.info(
      `[supabase-smoke] ${channel} connectivity restored after ${state.consecutiveFailures} failure${state.consecutiveFailures === 1 ? '' : 's'}`
    );
  } else if (!state.hadSuccess) {
    logger.info(message, ...args);
  } else if (process.env.SUPABASE_SMOKE_VERBOSE_SUCCESS === 'true') {
    logger.debug(message, ...args);
  }
  state.consecutiveFailures = 0;
  state.suppressed = 0;
  state.lastWarnTime = 0;
  state.lastWarnMessage = null;
  state.hadSuccess = true;
}

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
        logFailure('storage', '[supabase-smoke] storage.listBuckets returned error:', error.message || error);
        return false;
      }
      logSuccess('storage', '[supabase-smoke] Supabase storage reachable — buckets:', Array.isArray(data) ? data.length : 'unknown');
      return true;
    }

    // Fallback: try a small DB select on the `photos` table (non-destructive)
    if (supabaseClient && typeof supabaseClient.from === 'function') {
      const res = await supabaseClient.from('photos').select('id').limit(1);
      const error = res && res.error;
      if (error) {
        logFailure('db', '[supabase-smoke] db select returned error:', error.message || error);
        return false;
      }
      logSuccess('db', '[supabase-smoke] Supabase DB reachable (photos table OK)');
      return true;
    }

    logFailure('general', '[supabase-smoke] Supabase client does not expose storage.listBuckets or from(). Skipping smoke-check.');
    return false;
  } catch (err) {
    logFailure('exception', '[supabase-smoke] Exception during smoke-check:', err && err.message ? err.message : err);
    return false;
  }
};
