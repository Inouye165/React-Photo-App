import { Request, Response, NextFunction } from 'express';

const { getOrCreateRequestId } = require('../lib/requestId');

function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = getOrCreateRequestId(req);
  try {
    res.setHeader('x-request-id', requestId);
  } catch {
    // ignore
  }

  // Log X-Diag-Id correlation header when present (frontend diagnostic mode).
  // Do NOT log auth headers â€” only the short diagnostic id.
  const diagId = req.headers['x-diag-id'];
  if (diagId && typeof diagId === 'string' && diagId.length <= 16) {
    const logger = require('../logger');
    logger.info(`[diag] rid=${requestId} diagId=${diagId} ${req.method} ${req.originalUrl || req.url}`);
  }

  return next();
}

module.exports = {
  requestIdMiddleware,
};
