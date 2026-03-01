// @ts-nocheck

class BootError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, details?: unknown, cause?: unknown }} [options]
   */
  constructor(message, options = {}) {
    super(message, options.cause != null ? { cause: options.cause } : undefined);
    this.name = 'BootError';
    this.code = options.code || 'BOOT_ERROR';
    this.details = options.details;
  }
}

module.exports = {
  BootError,
};
