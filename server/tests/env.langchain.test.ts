/* eslint-env jest */

/// <reference path="./jest-globals.d.ts" />

export {};

describe('env/langchain config', () => {
  beforeEach(() => {
    jest.resetModules();

    process.env.NODE_ENV = 'test';

    delete process.env.LANGCHAIN_API_KEY;
    delete process.env.LANGSMITH_API_KEY;
    delete process.env.LANGCHAIN_TRACING_V2;
    delete process.env.LANGSMITH_TRACING;
  });

  test('getConfig uses LANGCHAIN_API_KEY when set', () => {
    process.env.LANGCHAIN_API_KEY = 'lsv2_test_langchain_key';

    const { getConfig, __resetForTests } = require('../config/env');
    __resetForTests();

    const cfg = getConfig();
    expect(cfg.langchain.apiKey).toBe('lsv2_test_langchain_key');
  });

  test('getConfig falls back to LANGSMITH_API_KEY when LANGCHAIN_API_KEY is missing', () => {
    process.env.LANGSMITH_API_KEY = 'lsv2_test_langsmith_key';

    const { getConfig, __resetForTests } = require('../config/env');
    __resetForTests();

    const cfg = getConfig();
    expect(cfg.langchain.apiKey).toBe('lsv2_test_langsmith_key');
  });
});
