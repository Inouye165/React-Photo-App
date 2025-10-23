const fs = require('fs');
const path = require('path');

// We'll test processPhotoAI by mocking the chain adapter to return a predictable response
jest.mock('../ai/langchain/chainAdapter', () => ({
  runChain: jest.fn(async ({ _messages }) => ({
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
    // Skip if no OpenAI API key in CI environment
    if (!process.env.OPENAI_API_KEY) {
      console.log('Skipping OpenAI test - no API key available');
      return;
    }

    const fileBuffer = fs.readFileSync(tmpFile);
    const res = await processPhotoAI({ fileBuffer, filename: 'tmp_test.jpg', metadata: {}, gps: '', device: '' });
    expect(res).toBeDefined();
    expect(res.caption).toBe('Test');
    expect(res.description).toBe('desc');
    expect(res.keywords).toContain('a,b');
    expect(res.keywords).toContain('AI:openai');
  });
});
