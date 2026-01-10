const { randomUUID } = require('crypto');

function sanitizeRequestId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Prevent log injection and keep IDs low-entropy/low-risk.
  // Allow a conservative charset: alnum, underscore, dash, dot, colon.
  const stripped = trimmed.replace(/[\r\n\t]/g, '').replace(/[^A-Za-z0-9_.:-]/g, '');
  if (!stripped) return null;

  const maxLen = 64;
  return stripped.length > maxLen ? stripped.slice(0, maxLen) : stripped;
}

function getOrCreateRequestId(req) {
  const candidates = [
    req?.requestId,
    req?.id,
    req?.headers?.['x-request-id'],
    req?.headers?.['x-requestid'],
  ];

  for (const candidate of candidates) {
    const sanitized = sanitizeRequestId(candidate);
    if (sanitized) {
      if (req) {
        req.requestId = sanitized;
        req.id = sanitized;
      }
      return sanitized;
    }
  }

  const generated = typeof randomUUID === 'function' ? randomUUID() : Math.random().toString(36).slice(2, 10);
  const sanitizedGenerated = sanitizeRequestId(generated) || generated;
  if (req) {
    req.requestId = sanitizedGenerated;
    req.id = sanitizedGenerated;
  }
  return sanitizedGenerated;
}

module.exports = {
  sanitizeRequestId,
  getOrCreateRequestId,
};
