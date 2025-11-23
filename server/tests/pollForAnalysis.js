// test/pollForAnalysis.js
/**
 * Polls the DB for AI metadata to appear for a photo.
 * @param {function} db - Knex instance
 * @param {string|number} photoId - Photo ID
 * @param {object} [opts]
 * @param {number} [opts.timeout=5000] - Max ms to wait
 * @param {number} [opts.interval=200] - Poll interval ms
 * @returns {Promise<object>} - Resolves with the photo row when AI metadata is present
 */
async function pollForAnalysis(db, photoId, opts = {}) {
  const timeout = opts.timeout || 5000;
  const interval = opts.interval || 200;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const row = await db('photos').where({ id: photoId }).first();
    if (row && row.caption && row.keywords && row.description) {
      return row;
    }
    await new Promise(res => setTimeout(res, interval));
  }
  throw new Error(`AI metadata not available for photo ${photoId} after ${timeout}ms`);
}

module.exports = { pollForAnalysis };