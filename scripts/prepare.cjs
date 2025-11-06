#!/usr/bin/env node
/**
 * Conditional husky install script for prepare lifecycle hook.
 * Only runs husky install if:
 * 1. We're not in CI environment (CI, GITHUB_ACTIONS, etc.)
 * 2. Husky is available in node_modules
 * 
 * This prevents errors when:
 * - Installing the photo-app package as a dependency in subdirectories (like server/)
 * - Running in CI where husky is not needed
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Skip husky in CI environments
if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
  console.log('[prepare] CI environment detected, skipping husky install');
  process.exit(0);
}

// Check if husky is available
const huskyPath = path.join(__dirname, '..', 'node_modules', 'husky');

try {
  if (fs.existsSync(huskyPath)) {
    console.log('[prepare] Running husky install...');
    // Use npx to ensure husky is found in node_modules/.bin
    execSync('npx husky install', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } else {
    console.log('[prepare] Husky not found, skipping install (this is OK in subdirectories)');
  }
} catch (error) {
  console.warn('[prepare] Warning: husky install failed:', error.message);
  // Don't fail the prepare script - just warn
}

