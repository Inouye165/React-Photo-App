const fs = require('fs');
const path = require('path');

// Mock the convertHeicToJpegBuffer to avoid relying on real ImageMagick/sharp
jest.mock('../media/image', () => ({
  convertHeicToJpegBuffer: jest.fn(async (_filePath, _quality) => Buffer.from('fakejpeg')),
}));

// Mock the chain adapter to return predictable JSON
jest.mock('../ai/langchain/chainAdapter', () => ({
  runChain: jest.fn(async ({ _messages }) => ({
    choices: [{ message: { content: JSON.stringify({ caption: 'HEIC Test', description: 'desc heic', keywords: 'x,y' }) } }]
  }))
}));

const { processPhotoAI } = require('../ai/service');

describe('processPhotoAI HEIC path', () => {
  const tmpFile = path.join(__dirname, 'tmp_test.heic');

  beforeAll(() => {
    // create a placeholder file path (content not used because convertHeicToJpegBuffer is mocked)
    fs.writeFileSync(tmpFile, 'heicplaceholder');
  });

  afterAll(() => {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  });

  it('handles HEIC conversion and returns parsed AI result', async () => {
    // Skip if no OpenAI API key in CI environment
    if (!process.env.OPENAI_API_KEY) {
      console.log('Skipping OpenAI HEIC test - no API key available');
      return;
    }

    const fileBuffer = fs.readFileSync(tmpFile);
    const res = await processPhotoAI({ fileBuffer, filename: 'tmp_test.heic', metadata: {}, gps: '', device: '' });
    expect(res).toBeDefined();
    expect(res.caption).toBe('HEIC Test');
    expect(res.description).toBe('desc heic');
    expect(res.keywords).toContain('x,y');
  });
});
