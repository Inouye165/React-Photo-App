const { getOrCreateRequestId } = require('../lib/requestId');

function requestIdMiddleware(req, res, next) {
  const requestId = getOrCreateRequestId(req);
  try {
    res.setHeader('x-request-id', requestId);
  } catch {
    // ignore
  }
  return next();
}

module.exports = {
  requestIdMiddleware,
};
