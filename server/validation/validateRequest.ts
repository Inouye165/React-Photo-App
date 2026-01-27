// Zod is used via schema.safeParse; do not import unused symbols.

import type { Request, Response, NextFunction } from 'express';
import { getOrCreateRequestId } from '../lib/requestId';

type SafeParseSuccess<T> = { success: true; data: T };
type SafeParseFailure = { success: false; error?: unknown };
type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;

type ZodSchemaLike<T> = {
  safeParse: (input: unknown) => SafeParseResult<T>;
};

type ValidateRequestSchemas = {
  params?: ZodSchemaLike<unknown>;
  query?: ZodSchemaLike<unknown>;
  body?: ZodSchemaLike<unknown>;
};

type ValidatedContainer = {
  params?: unknown;
  query?: unknown;
  body?: unknown;
};

interface RequestWithValidated extends Request {
  validated?: ValidatedContainer;
}

type ErrorEnvelopeInput = {
  code: string;
  message: string;
  requestId: string;
};

function buildErrorEnvelope({ code, message, requestId }: ErrorEnvelopeInput) {
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
function validateRequest({ params, query, body }: ValidateRequestSchemas = {}) {
  if (params && typeof params.safeParse !== 'function') {
    throw new Error('validateRequest: params must be a Zod schema');
  }
  if (query && typeof query.safeParse !== 'function') {
    throw new Error('validateRequest: query must be a Zod schema');
  }
  if (body && typeof body.safeParse !== 'function') {
    throw new Error('validateRequest: body must be a Zod schema');
  }

  return function validateRequestMiddleware(req: RequestWithValidated, res: Response, next: NextFunction) {
    const requestId = getOrCreateRequestId(req as any);

    const validated = req.validated && typeof req.validated === 'object' ? req.validated : {};

    if (params) {
      const result = params.safeParse(req.params);
      if (!result.success) {
        return res
          .status(400)
          .json(buildErrorEnvelope({ code: 'BAD_REQUEST', message: 'Invalid request', requestId }));
      }
      validated.params = result.data;
    }

    if (query) {
      const result = query.safeParse(req.query);
      if (!result.success) {
        return res
          .status(400)
          .json(buildErrorEnvelope({ code: 'BAD_REQUEST', message: 'Invalid request', requestId }));
      }
      validated.query = result.data;
    }

    if (body) {
      const result = body.safeParse(req.body);
      if (!result.success) {
        return res
          .status(422)
          .json(buildErrorEnvelope({ code: 'VALIDATION_ERROR', message: 'Validation failed', requestId }));
      }
      validated.body = result.data;
    }

    req.validated = validated;
    return next();
  };
}

export { validateRequest, buildErrorEnvelope, getOrCreateRequestId };