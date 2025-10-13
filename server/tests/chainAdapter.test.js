const { vi } = require('vitest');

// Mock the OpenAI module before requiring the adapter so the constructor used
// inside the adapter is the mocked one.
vi.mock('openai', () => {
  return function OpenAI() {
    return {
      chat: {
        completions: {
          create: async () => ({ choices: [{ message: { content: 'FAKE_OPENAI_RESPONSE' } }] })
        }
      }
    };
  };
});

describe('chainAdapter (simpleChain path)', () => {
  beforeAll(() => {
    // Enable simple chain before loading the adapter
    process.env.USE_SIMPLE_CHAIN = 'true';
  });

  it('runs simpleChain and returns OpenAI-like response with _ctx', async () => {
    // Mock the simpleChain implementation used by the adapter
    const simpleChain = require('../ai/langchain/simpleChain');
    vi.spyOn(simpleChain, 'runSimpleChain').mockResolvedValue({
      messages: [ { role: 'user', content: [ { type: 'text', text: 'dummy prompt' } ] } ],
      ctx: { test: 'context' }
    });

    const { runChain } = require('../ai/langchain/chainAdapter');
    const resp = await runChain({ filePath: '/tmp/a.jpg', metadata: {}, gps: '', device: '' });

    expect(resp).toBeDefined();
    expect(resp.choices[0].message.content).toBe('FAKE_OPENAI_RESPONSE');
    expect(resp._ctx).toEqual({ test: 'context' });
  });
});
