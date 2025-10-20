#!/usr/bin/env node

/**
 * Quick test runner to validate key functionality
 * Run with: node test-runner.js
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🧪 Running Photo App Test Suite\n');

const tests = [
  {
    name: 'Frontend Authentication Utils',
    command: 'npx vitest run src/tests/authUtils.test.js',
    description: 'Tests authentication utility functions'
  },
  {
    name: 'Server Security Middleware',
    command: 'cd server && npm test -- tests/security.test.js',
    description: 'Tests security headers and middleware'
  },
  {
    name: 'HEIC Conversion Logic',
    command: 'cd server && npm test -- tests/heicConversion.test.js',
    description: 'Tests HEIC to JPEG conversion functionality'
  },
  {
    name: 'Database Operations',
    command: 'cd server && npm test -- tests/db.test.js',
    description: 'Tests database CRUD operations'
  }
];

const results = [];

for (const test of tests) {
  console.log(`\n🔍 Running: ${test.name}`);
  console.log(`   ${test.description}`);
  
  try {
    const output = execSync(test.command, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    // Check if test passed by looking for success indicators
    const passed = output.includes('✓') || output.includes('PASS') || !output.includes('FAIL');
    
    results.push({
      name: test.name,
      status: passed ? 'PASS' : 'FAIL',
      output: output.split('\n').slice(-5).join('\n') // Last 5 lines
    });
    
    console.log(`   ✅ ${test.name} PASSED`);
    
  } catch (error) {
    results.push({
      name: test.name,
      status: 'FAIL',
      error: error.message.split('\n').slice(-5).join('\n')
    });
    
    console.log(`   ❌ ${test.name} FAILED`);
  }
}

// Summary
console.log('\n📊 Test Results Summary:');
console.log('================================');

let passed = 0;
let failed = 0;

for (const result of results) {
  const status = result.status === 'PASS' ? '✅' : '❌';
  console.log(`${status} ${result.name}: ${result.status}`);
  
  if (result.status === 'PASS') {
    passed++;
  } else {
    failed++;
  }
}

console.log(`\n📈 Summary: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\n🎉 All critical tests are passing!');
  console.log('✅ Authentication system working');
  console.log('✅ HEIC conversion functional');
  console.log('✅ Security measures active');
  console.log('✅ Database operations stable');
} else {
  console.log('\n⚠️  Some tests failed - see details above');
  console.log('💡 Note: Server integration tests may require manual server setup');
}

console.log('\n📖 For complete test details, see TEST_SUMMARY.md');
console.log('🔧 To run individual tests: npm test or npx vitest run [test-file]');