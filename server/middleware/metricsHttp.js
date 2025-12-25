const metrics = require('../metrics');

function normalizeRouteLabel(route) {
  const s = String(route || '').trim();
  if (s === '') return 'unknown';

  // Collapse duplicate slashes.
  let out = s.replace(/\/+/g, '/');

  // Prefer no trailing slash for non-root routes.
  if (out.length > 1 && out.endsWith('/')) {
    out = out.slice(0, -1);
  }

  // Ensure route labels always start with '/'
  if (!out.startsWith('/')) {
    out = '/' + out;
  }

  return out;
}

function deriveRouteLabel(req, res) {
  const baseUrl = req.baseUrl || '';
  const routePath = (req.route && req.route.path) ? req.route.path : '';

  if (routePath) {
    return normalizeRouteLabel(`${baseUrl}${routePath}`);
  }

  // When no route matched, use stable fixed labels.
  if (res && Number(res.statusCode) === 404) {
    return 'not_found';
  }

  return 'unknown';
}

module.exports = function metricsHttpMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;

    const method = req.method;
    const status = String(res.statusCode);
    const route = deriveRouteLabel(req, res);

    metrics.observeHttpRequest({
      method,
      route,
      status,
      durationMs,
    });
  });

  next();
};
