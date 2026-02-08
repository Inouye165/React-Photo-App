/**
 * Simple test environment setup for CI
 * This file ensures tests run without external dependencies
 */

// Skip tests that require external services when OPENAI_API_KEY is not set
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = 'test_openai_key_ci';
}

// Set test environment
process.env.NODE_ENV = 'test';
// Only enable noisy-log filtering in CI to avoid changing local dev behavior.
// Prefer CI-only suppression to keep production/runtime logging unchanged.
const CI_MODE = process.env.CI === 'true' || process.env.CI === '1';

if (CI_MODE) {
  // Mock console methods to reduce noise in CI
  const originalError = console.error;
  const originalWarn = console.warn;

  // Narrow allowlist of substrings to suppress. Keep this minimal and
  // specific so we don't accidentally silence important errors.
  const WARN_SUPPRESS = [
    'Suspicious request detected',
    'Security error from'
  ];

  const ERROR_SUPPRESS = [
    // Jest worker teardown noise (non-failing) — noisy in CI logs.
    'A worker process has failed to exit gracefully',
    'has been force exited'
  ];

  // Some modules emit noisy informational logs via console.log during tests
  // (e.g. Google Places debug lines, VisualSearch helpers). Add a very
  // narrow list for CI to keep logs readable while preserving other output.
  const LOG_SUPPRESS = [
    '[infer_poi]',
    '[VisualSearch]'
  ];

  console.error = (...args) => {
    const flat = args.map(a => {
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' ');
    for (const s of ERROR_SUPPRESS) {
      if (flat.includes(s)) return; // drop this known, non-failing noise
    }
    originalError.apply(console, args);
  };

  console.warn = (...args) => {
    const flat = args.map(a => {
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' ');
    for (const s of WARN_SUPPRESS) {
      if (flat.includes(s)) return; // drop these expected security warnings
    }
    originalWarn.apply(console, args);
  };

  // Suppress a few noisy informational logs in CI only.
  const originalLog = console.log;
  console.log = (...args) => {
    const flat = args.map(a => {
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' ');
    for (const s of LOG_SUPPRESS) {
      if (flat.includes(s)) return;
    }
    originalLog.apply(console, args);
  };
}