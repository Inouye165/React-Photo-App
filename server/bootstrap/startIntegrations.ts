// @ts-nocheck

function startIntegrations({ logger, socketManager, supabase }) {
  if (!logger) logger = require('../logger');

  const handles = [];

  // Phase 2: multi-instance readiness via Redis Pub/Sub fanout (best-effort)
  try {
    const { createPhotoStatusSubscriber } = require('../realtime/photoStatusSubscriber');
    const photoStatusSubscriber = createPhotoStatusSubscriber({ socketManager });

    photoStatusSubscriber.start().catch((err) => {
      logger.error('[realtime] Failed to start photo status subscriber', err);
    });

    handles.push({
      name: 'photoStatusSubscriber',
      stop: async () => {
        try {
          await photoStatusSubscriber.stop();
        } catch (err) {
          logger.error('[realtime] Failed to stop photo status subscriber', err);
        }
      },
    });
  } catch (err) {
    logger.error('[realtime] Failed to initialize photo status subscriber', err);
  }

  // Non-blocking Supabase connectivity smoke-check: runs once on startup and
  // logs whether Supabase storage or DB is reachable.
  try {
    const runSmoke = require('../smoke-supabase');
    const client = supabase || require('../lib/supabaseClient');

    let intervalId = null;
    let stopped = false;

    (async () => {
      try {
        await runSmoke(client);

        if (stopped) return;

        const intervalMs = Number(process.env.SUPABASE_SMOKE_INTERVAL_MS) || 10 * 60 * 1000;
        intervalId = setInterval(() => {
          runSmoke(client).catch((e) =>
            console.warn(
              '[supabase-smoke] periodic check failed:',
              e && e.message ? e.message : e
            )
          );
        }, intervalMs);
      } catch (err) {
        console.warn(
          '[supabase-smoke] Skipped or failed to run smoke-check:',
          err && err.message ? err.message : err
        );
      }
    })();

    handles.push({
      name: 'supabaseSmokeInterval',
      stop: async () => {
        stopped = true;
        if (intervalId) {
          try {
            clearInterval(intervalId);
          } catch {
            // ignore
          }
          intervalId = null;
        }
      },
    });
  } catch (err) {
    console.warn(
      '[supabase-smoke] Skipped or failed to configure smoke-check:',
      err && err.message ? err.message : err
    );
  }

  return {
    handles,
  };
}

module.exports = {
  startIntegrations,
};
