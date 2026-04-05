// test/pollForAnalysis.ts

interface PollOptions {
  timeout?: number;
  interval?: number;
}

interface PhotoRow {
  id: string | number;
  caption?: string;
  keywords?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Polls the DB for AI metadata to appear for a photo.
 */
async function pollForAnalysis(db: Function, photoId: string | number, opts: PollOptions = {}): Promise<PhotoRow> {
  const timeout: number = opts.timeout || 5000;
  const interval: number = opts.interval || 200;
  const start: number = Date.now();
  while (Date.now() - start < timeout) {
    const row: PhotoRow | undefined = await (db as Function)('photos').where({ id: photoId }).first();
    if (row && row.caption && row.keywords && row.description) {
      return row;
    }
    await new Promise<void>(res => setTimeout(res, interval));
  }
  throw new Error(`AI metadata not available for photo ${photoId} after ${timeout}ms`);
}

module.exports = { pollForAnalysis };
