const { z } = require('zod');

const uuidSchema = z.string().uuid();

function validateUuid(value: unknown): { ok: boolean; value: string | null } {
  const result = uuidSchema.safeParse(value);
  if (!result.success) {
    return { ok: false, value: null };
  }
  return { ok: true, value: result.data };
}

module.exports = {
  uuidSchema,
  validateUuid,
};

export {};
