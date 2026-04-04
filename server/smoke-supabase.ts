type LoggerLike = {
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  isLevelEnabled?: (level: string) => boolean;
};

type ChannelState = {
  consecutiveFailures: number;
  suppressed: number;
  lastWarnTime: number;
  lastWarnMessage: string | null;
  hadSuccess: boolean;
};

type SupabaseErrorLike = {
  message?: string;
};

type StorageClientLike = {
  listBuckets?: () => Promise<{ data?: unknown; error?: SupabaseErrorLike | null }>;
};

type QueryBuilderLike = {
  limit: (count: number) => Promise<{ error?: SupabaseErrorLike | null }>;
};

type SupabaseClientLike = {
  storage?: StorageClientLike;
  from?: (table: string) => { select: (columns: string) => QueryBuilderLike };
};

const logger = require('./logger') as LoggerLike;

const WARN_THROTTLE_MS = Number(process.env.SUPABASE_SMOKE_WARN_THROTTLE_MS) || 60_000;
const channelState = new Map<string, ChannelState>();

function getState(channel: string): ChannelState {
  const existing = channelState.get(channel);
  if (existing) {
    return existing;
  }

  const created: ChannelState = {
    consecutiveFailures: 0,
    suppressed: 0,
    lastWarnTime: 0,
    lastWarnMessage: null,
    hadSuccess: false,
  };
  channelState.set(channel, created);
  return created;
}

function normalizeMessage(message: unknown): string {
  return typeof message === 'string' ? message : JSON.stringify(message);
}

function logFailure(channel: string, message: unknown, ...args: unknown[]): void {
  const state = getState(channel);
  state.consecutiveFailures += 1;

  const now = Date.now();
  const normalized = normalizeMessage(message);
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
    return;
  }

  state.suppressed += 1;
  if (typeof logger.isLevelEnabled === 'function' && logger.isLevelEnabled('debug')) {
    const plural = state.suppressed === 1 ? '' : 's';
    logger.debug(
      `[supabase-smoke] suppressed ${channel} warning (${state.suppressed} duplicate${plural} within ${WARN_THROTTLE_MS}ms window)`
    );
  }
}

function logSuccess(channel: string, message: unknown, ...args: unknown[]): void {
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

async function runSupabaseSmoke(supabaseClient?: SupabaseClientLike): Promise<boolean> {
  try {
    const client = supabaseClient ?? (require('./lib/supabaseClient') as SupabaseClientLike);

    if (client.storage && typeof client.storage.listBuckets === 'function') {
      const { data, error } = await client.storage.listBuckets();
      if (error) {
        logFailure('storage', '[supabase-smoke] storage.listBuckets returned error:', error.message || error);
        return false;
      }
      logSuccess(
        'storage',
        '[supabase-smoke] Supabase storage reachable - buckets:',
        Array.isArray(data) ? data.length : 'unknown'
      );
      return true;
    }

    if (typeof client.from === 'function') {
      const response = await client.from('photos').select('id').limit(1);
      const error = response?.error;
      if (error) {
        logFailure('db', '[supabase-smoke] db select returned error:', error.message || error);
        return false;
      }
      logSuccess('db', '[supabase-smoke] Supabase DB reachable (photos table OK)');
      return true;
    }

    logFailure('general', '[supabase-smoke] Supabase client does not expose storage.listBuckets or from(). Skipping smoke-check.');
    return false;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : error;
    logFailure('exception', '[supabase-smoke] Exception during smoke-check:', message);
    return false;
  }
}

export = runSupabaseSmoke;