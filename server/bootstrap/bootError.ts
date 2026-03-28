interface BootErrorOptions {
  code?: string;
  details?: unknown;
  cause?: unknown;
}

class BootError extends Error {
  code: string;
  details: unknown;

  constructor(message: string, options: BootErrorOptions = {}) {
    super(message, options.cause != null ? { cause: options.cause } : undefined);
    this.name = 'BootError';
    this.code = options.code || 'BOOT_ERROR';
    this.details = options.details;
  }
}

module.exports = {
  BootError,
};

export {};
