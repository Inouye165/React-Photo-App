/**
 * Mock for is-network-error ESM module
 * This avoids Jest ESM parsing issues in CI
 */

function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  
  const message: string = (error as { message?: string }).message || '';
  const code: string = (error as { code?: string }).code || '';
  
  // Common network error patterns
  const networkErrorMessages: string[] = [
    'network',
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ENETUNREACH',
    'EAI_AGAIN',
    'socket hang up',
    'CERT_',
    'SSL_',
    'fetch failed'
  ];
  
  return networkErrorMessages.some((pattern: string) => 
    message.toLowerCase().includes(pattern.toLowerCase()) ||
    code.includes(pattern)
  );
}

module.exports = isNetworkError;
module.exports.default = isNetworkError;
