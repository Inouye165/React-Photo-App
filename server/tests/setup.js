/**
 * Test setup file for configuring mocks and test environment
 */
/* eslint-env jest */

const { mockStorageHelpers } = require('./__mocks__/supabase');
const { mockDbHelpers } = require('./__mocks__/knex');

// Mock Supabase before any modules are imported
jest.mock('@supabase/supabase-js', () => {
  return require('./__mocks__/supabase');
});

// Mock the database connection
jest.mock('../db/index.js', () => {
  return require('./__mocks__/knex');
});

// Mock LangChain agents to avoid calling external OpenAI services during tests
// This loads the manual mock defined in tests/__mocks__/langchainAgents.js
jest.mock('../ai/langchain/agents', () => {
  return require('./__mocks__/langchainAgents');
});

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';

// Global test setup
beforeEach(() => {
  // Clear all mocks before each test
  mockStorageHelpers.clearMockStorage();
  mockDbHelpers.clearMockData();
  
  // Load default test data
  mockDbHelpers.loadDefaultData();
  
  // Reset all Jest mocks
  jest.clearAllMocks();
});

// Global test teardown
afterEach(() => {
  // Additional cleanup if needed
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = {
  mockStorageHelpers,
  mockDbHelpers
};