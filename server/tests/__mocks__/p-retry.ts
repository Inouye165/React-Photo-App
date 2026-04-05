/**
 * Mock for p-retry ESM module
 * This avoids Jest ESM parsing issues in CI
 */

interface PRetryOptions {
  retries?: number;
  onFailedAttempt?: (attemptInfo: {
    attemptNumber: number;
    retriesLeft: number;
    error: Error;
  }) => void | Promise<void>;
}

interface PRetryFn {
  (fn: (attempt: number) => unknown | Promise<unknown>, options?: PRetryOptions): Promise<unknown>;
  AbortError: typeof AbortError;
}

async function pRetry(fn: (attempt: number) => unknown | Promise<unknown>, options: PRetryOptions = {}): Promise<unknown> {
  const retries: number = options.retries || 3;
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error as Error;
      
      // Check if we should abort
      if (error instanceof AbortError) {
        throw (error as AbortError).originalError || error;
      }
      
      // Check onFailedAttempt callback
      if (options.onFailedAttempt) {
        await options.onFailedAttempt({
          attemptNumber: attempt + 1,
          retriesLeft: retries - attempt,
          error: error as Error
        });
      }
      
      // If this was the last attempt, throw
      if (attempt >= retries) {
        throw lastError;
      }
    }
  }
  
  throw lastError;
}

class AbortError extends Error {
  originalError?: Error;

  constructor(message: string | Error) {
    super();
    if (message instanceof Error) {
      this.originalError = message;
      this.message = message.message;
    } else {
      this.message = message;
    }
    this.name = 'AbortError';
  }
}

(pRetry as PRetryFn).AbortError = AbortError;

module.exports = pRetry;
module.exports.default = pRetry;
module.exports.AbortError = AbortError;
