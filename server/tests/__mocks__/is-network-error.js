/**
 * Mock for is-network-error ESM module
 * This avoids Jest ESM parsing issues in CI
 */

function isNetworkError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }
  
  const message = error.message || '';
  const code = error.code || '';
  
  // Common network error patterns
  const networkErrorMessages = [
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
  
  return networkErrorMessages.some(pattern => 
    message.toLowerCase().includes(pattern.toLowerCase()) ||
    code.includes(pattern)
  );
}

module.exports = isNetworkError;
module.exports.default = isNetworkError;
