/**
 * Mock for p-retry ESM module
 * This avoids Jest ESM parsing issues in CI
 */

async function pRetry(fn, options = {}) {
  const retries = options.retries || 3;
  let lastError;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      
      // Check if we should abort
      if (error instanceof pRetry.AbortError) {
        throw error.originalError || error;
      }
      
      // Check onFailedAttempt callback
      if (options.onFailedAttempt) {
        await options.onFailedAttempt({
          attemptNumber: attempt + 1,
          retriesLeft: retries - attempt,
          error
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
  constructor(message) {
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

pRetry.AbortError = AbortError;

module.exports = pRetry;
module.exports.default = pRetry;
module.exports.AbortError = AbortError;
