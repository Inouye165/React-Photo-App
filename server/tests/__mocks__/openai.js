/**
 * Mock implementation of OpenAI client for testing
 * This prevents tests from making actual API calls to OpenAI
 * and avoids ECONNRESET errors during rapid test runs
 */
/* eslint-env jest */

// Mock models list - simulates what OpenAI API would return
const mockModels = [
  { id: 'gpt-4-turbo-preview', object: 'model', created: 1698959748, owned_by: 'system' },
  { id: 'gpt-4-vision-preview', object: 'model', created: 1698959748, owned_by: 'system' },
  { id: 'gpt-4', object: 'model', created: 1698959748, owned_by: 'openai' },
  { id: 'gpt-3.5-turbo', object: 'model', created: 1698959748, owned_by: 'openai' },
  { id: 'gpt-3.5-turbo-16k', object: 'model', created: 1698959748, owned_by: 'openai' }
];

class MockOpenAI {
  constructor(config = {}) {
    this.apiKey = config.apiKey || 'mock-api-key';
    this.models = {
      list: jest.fn().mockResolvedValue({
        object: 'list',
        data: mockModels
      })
    };
    
    this.chat = {
      completions: {
        create: jest.fn().mockResolvedValue({
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: 'Mock response from OpenAI'
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
          }
        })
      }
    };
  }
}

module.exports = MockOpenAI;
module.exports.default = MockOpenAI;
