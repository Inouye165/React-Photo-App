/**
 * Simple test environment setup for CI
 * This file ensures tests run without external dependencies
 */

// Skip tests that require external services when OPENAI_API_KEY is not set
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = 'sk-test-key-for-ci';
}

// Set test environment
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise in CI
const originalError = console.error;
const originalWarn = console.warn;

console.error = (...args) => {
  // Only show real errors, suppress test-related noise
  if (args[0] && typeof args[0] === 'string') {
    if (args[0].includes('Metadata/hash extraction failed') ||
        args[0].includes('Supabase upload error') ||
        args[0].includes('[CONVERT]')) {
      return;
    }
  }
  originalError.apply(console, args);
};

console.warn = (...args) => {
  // Suppress security test warnings
  if (args[0] && typeof args[0] === 'string') {
    if (args[0].includes('Suspicious request detected') ||
        args[0].includes('Security error from')) {
      return;
    }
  }
  originalWarn.apply(console, args);
};