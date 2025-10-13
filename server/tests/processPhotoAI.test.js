const fs = require('fs');
const path = require('path');

// Use Vitest-friendly globals (the repo uses vitest)
const { vi } = require('vitest');

// We'll test processPhotoAI by mocking the chain adapter to return a predictable response
vi.mock('../ai/langchain/chainAdapter', () => ({
  runChain: vi.fn(async ({ _messages }) => ({
    choices: [{ message: { content: JSON.stringify({ caption: 'Test', description: 'desc', keywords: 'a,b' }) } }],
    _ctx: { method: 'openai' }
  }))
}));

const { processPhotoAI } = require('../ai/service');

describe('processPhotoAI', () => {
  const tmpFile = path.join(__dirname, 'tmp_test.jpg');

  beforeAll(() => {
    // create a tiny fake JPEG file (not a real image, but enough for fs.readFile)
    fs.writeFileSync(tmpFile, 'fakejpegcontent');
  });

  afterAll(() => {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  });

  it('returns parsed AI result for a simple file', async () => {
    const res = await processPhotoAI({ filePath: tmpFile, metadata: {}, gps: '', device: '' });
    expect(res).toBeDefined();
    expect(res.caption).toBe('Test');
    expect(res.description).toBe('desc');
    expect(res.keywords).toContain('a,b');
    expect(res.keywords).toContain('AI:openai');
  });
});
