// Zod is used via schema.safeParse; do not import unused symbols.

function getOrCreateRequestId(req) {
  const existing = req.requestId || req.id || req.headers?.['x-request-id'] || req.headers?.['x-requestid'];
  if (existing && typeof existing === 'string') return existing;
  const generated = Math.random().toString(36).slice(2, 10);
  req.requestId = generated;
  return generated;
}

function buildErrorEnvelope({ code, message, requestId }) {
  return {
    success: false,
    error: message,
    reqId: requestId,
    errorDetails: {
      code,
      message,
      requestId,
    },
  };
}

/**
 * validateRequest({ params?, query?, body? })
 * - Attaches parsed values to req.validated.{params,query,body}
 * - Params/query validation failures -> 400 BAD_REQUEST
 * - Body validation failures -> 422 VALIDATION_ERROR
 */
function validateRequest({ params, query, body } = {}) {
  if (params && typeof params.safeParse !== 'function') {
    throw new Error('validateRequest: params must be a Zod schema');
  }
  if (query && typeof query.safeParse !== 'function') {
    throw new Error('validateRequest: query must be a Zod schema');
  }
  if (body && typeof body.safeParse !== 'function') {
    throw new Error('validateRequest: body must be a Zod schema');
  }

  return function validateRequestMiddleware(req, res, next) {
    const requestId = getOrCreateRequestId(req);

    const validated = req.validated && typeof req.validated === 'object' ? req.validated : {};

    if (params) {
      const result = params.safeParse(req.params);
      if (!result.success) {
        return res.status(400).json(buildErrorEnvelope({ code: 'BAD_REQUEST', message: 'Invalid request', requestId }));
      }
      validated.params = result.data;
    }

    if (query) {
      const result = query.safeParse(req.query);
      if (!result.success) {
        return res.status(400).json(buildErrorEnvelope({ code: 'BAD_REQUEST', message: 'Invalid request', requestId }));
      }
      validated.query = result.data;
    }

    if (body) {
      const result = body.safeParse(req.body);
      if (!result.success) {
        return res.status(422).json(buildErrorEnvelope({ code: 'VALIDATION_ERROR', message: 'Validation failed', requestId }));
      }
      validated.body = result.data;
    }

    req.validated = validated;
    return next();
  };
}

module.exports = {
  validateRequest,
  buildErrorEnvelope,
  getOrCreateRequestId,
};
