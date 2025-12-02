#!/usr/bin/env node
/**
 * Decode a JWT token to see user ID
 */

const jwt = require('jsonwebtoken');

const token = process.argv[2];
if (!token) {
  console.error('Usage: node scripts/check-token.js <token>');
  process.exit(1);
}

try {
  // Decode without verification to see claims
  const decoded = jwt.decode(token);
  console.log('\n=== Token Claims ===\n');
  console.log(JSON.stringify(decoded, null, 2));
  console.log('\n=== User ID ===');
  console.log(`sub: ${decoded.sub}`);
} catch (error) {
  console.error('Error decoding token:', error.message);
}
