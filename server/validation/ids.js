const { z } = require('zod');

const uuidSchema = z.string().uuid();

function validateUuid(value) {
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
