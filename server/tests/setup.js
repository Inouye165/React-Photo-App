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

// Mock LangGraph and LangChain modules to avoid ESM import errors
jest.mock('@langchain/langgraph', () => ({
  StateGraph: jest.fn().mockImplementation(() => ({
    addNode: jest.fn().mockReturnThis(),
    addEdge: jest.fn().mockReturnThis(),
    addConditionalEdges: jest.fn().mockReturnThis(),
    setEntryPoint: jest.fn().mockReturnThis(),
    compile: jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue({}),
      stream: jest.fn().mockResolvedValue([])
    })
  })),
  END: 'END',
  START: 'START'
}));

jest.mock('@langchain/core/messages', () => ({
  HumanMessage: jest.fn(),
  SystemMessage: jest.fn(),
  AIMessage: jest.fn()
}));

jest.mock('@langchain/core/tools', () => ({
  tool: jest.fn((config) => ({
    name: config?.name || 'mock-tool',
    description: config?.description || 'mock description',
    schema: config?.schema || {},
    invoke: jest.fn().mockResolvedValue('mock result')
  })),
  StructuredTool: jest.fn()
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    bindTools: jest.fn().mockReturnThis(),
    invoke: jest.fn().mockResolvedValue({ content: 'mocked response' }),
    stream: jest.fn().mockResolvedValue([])
  }))
}));

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
// Provide a dummy OpenAI API key for tests so modules that validate at load time do not throw
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-api-key';

// Provide LangSmith defaults so tests do not depend on local .env
// LangChain environment variables removed.
// process.env.LANGCHAIN_TRACING_V2 = process.env.LANGCHAIN_TRACING_V2 || 'true';
// process.env.LANGCHAIN_API_KEY = process.env.LANGCHAIN_API_KEY || 'lsv2_test_key_abcdefghijklmnopqrstuvwxyz';
// process.env.LANGCHAIN_PROJECT = process.env.LANGCHAIN_PROJECT || 'photo-app';

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

afterAll(async () => {
  // exiftool-vendored starts a background BatchCluster that keeps the event loop alive.
  // Shut it down so Jest can exit cleanly.
  try {
    const { exiftool } = require('exiftool-vendored');
    if (exiftool && typeof exiftool.end === 'function') {
      await exiftool.end();
    }
  } catch {
    // Best-effort cleanup only
  }
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = {
  mockStorageHelpers,
  mockDbHelpers
};