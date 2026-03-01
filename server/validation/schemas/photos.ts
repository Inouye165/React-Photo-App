// @ts-nocheck

const { z } = require('zod');
const { safeParseObject } = require('../../serializers/json');

function firstQueryValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseLimit(value) {
  const raw = firstQueryValue(value);
  if (raw === undefined || raw === null || raw === '') return undefined;
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(num)) return NaN;
  return num;
}

function decodeCursor(value) {
  const raw = firstQueryValue(value);
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') return '__INVALID__';

  try {
    const decoded = Buffer.from(String(raw), 'base64url').toString('utf8');
    const parsed = safeParseObject(decoded);
    if (!parsed) return '__INVALID__';
    return parsed;
  } catch {
    return '__INVALID__';
  }
}

const cursorSchema = z
  .preprocess((value) => {
    const decoded = decodeCursor(value);
    if (decoded === '__INVALID__') return { __invalid: true };
    return decoded;
  }, z.union([z.null(), z.record(z.unknown())]))
  .superRefine((cursor, ctx) => {
    if (cursor === null) return;
    if (cursor && cursor.__invalid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor parameter' });
      return;
    }

    if (!(typeof cursor === 'object' && 'created_at' in cursor && 'id' in cursor)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor parameter' });
      return;
    }

    if (typeof cursor.created_at !== 'string' || Number.isNaN(Date.parse(cursor.created_at))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor parameter' });
    }

    if (!Number.isInteger(cursor.id) || cursor.id <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor parameter' });
    }
  })
  .transform((cursor) => {
    if (cursor === null) return null;
    return { created_at: cursor.created_at, id: cursor.id };
  });

const photosListQuerySchema = z.object({
  state: z.preprocess(firstQueryValue, z.string().optional()),
  limit: z
    .preprocess(parseLimit, z.any())
    .superRefine((val, ctx) => {
      if (val === undefined) return;
      if (!Number.isInteger(val) || val < 1 || val > 200) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid limit parameter. Must be integer between 1 and 200',
        });
      }
    })
    .transform((val) => (val === undefined ? undefined : val)),
  cursor: cursorSchema,
});

const photoIdParamsSchema = z.object({
  id: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.union([
      z.string().uuid({ message: 'Invalid photo id' }),
      z.string().regex(/^\d+$/, { message: 'Invalid photo id' }),
    ]),
  ),
});

module.exports = {
  photosListQuerySchema,
  photoIdParamsSchema,
};
