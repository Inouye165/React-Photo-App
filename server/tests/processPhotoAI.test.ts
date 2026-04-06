// File: c:\Users\Ron\React-Photo-App\server\tests\processPhotoAI.test.js
const fs = require('fs');
const path = require('path');

process.env.AI_ENABLED = process.env.AI_ENABLED || 'true';

jest.mock('../ai/langgraph/graph', () => ({
  app: { invoke: jest.fn() }
}));

// Mock the geolocate tool to avoid real network calls during tests
// LangChain geolocateTool mock removed. Refactor test if needed.

const { app: aiGraph } = require('../ai/langgraph/graph');
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

    aiGraph.invoke.mockResolvedValueOnce({
      classification: 'scenery_or_general_subject',
      finalResult: {
        caption: 'Test',
        description: 'desc',
        keywords: 'a,b'
      }
    });

    const fileBuffer = fs.readFileSync(tmpFile);
    const res = await processPhotoAI({ fileBuffer, filename: 'tmp_test.jpg', metadata: {}, gps: '', device: '' });
    expect(res).toBeDefined();
    expect(res.caption).toBe('Test');
    expect(res.description).toBe('desc');
    expect(res.keywords).toEqual(['a', 'b']);
  });
});
