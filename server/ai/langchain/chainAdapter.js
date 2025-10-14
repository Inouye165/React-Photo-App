const OpenAI = require('openai');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Optional simple chain implemented locally to allow an incremental LangChain
// migration without pulling in the LangChain SDK yet. Enable with
// USE_SIMPLE_CHAIN=true in .env to exercise the scaffold.
let useSimple = (process.env.USE_SIMPLE_CHAIN || 'false').toLowerCase() === 'true';
let runSimpleChain;
if (useSimple) {
  try {
    ({ runSimpleChain } = require('./simpleChain'));
  } catch (e) {
    // If the simple chain fails to load, fall back to native OpenAI path
    console.warn('Failed to load simpleChain, falling back to OpenAI client', e && (e.message || e));
    useSimple = false;
  }
}

// LangChain is now REQUIRED for processing - no fallbacks allowed
// Set USE_LANGCHAIN=false to disable LangChain (will throw error)
let useLangChain = (process.env.USE_LANGCHAIN !== 'false') && !useSimple;
let runLangChain;
if (useLangChain) {
  try {
    ({ runLangChain } = require('./langchainAdapter'));
  } catch (e) {
    console.error('CRITICAL: Failed to load LangChain adapter - LangChain is required for processing', e && (e.message || e));
    throw new Error('LangChain adapter failed to load - cannot proceed without LangChain');
  }
}

async function runChain({ messages, model = 'gpt-4o', max_tokens = 1500, temperature = 0.25, // additional args are ignored by simple chain
  // allow passing filePath/metadata for simpleChain mode
  filePath, metadata, gps, device } = {}) {
  // LangChain is REQUIRED - no fallbacks allowed
  if (!useLangChain) {
    throw new Error('LangChain is required for processing but is disabled. Set USE_LANGCHAIN=true or remove USE_LANGCHAIN=false from environment.');
  }

  console.log('ChainAdapter: Using REQUIRED LangChain path');
  try {
    const lcResp = await runLangChain({ messages, model, filePath, metadata, gps, device });
    return lcResp;
  } catch (lcErr) {
    console.error('CRITICAL: LangChain processing failed - no fallbacks available', lcErr && (lcErr.message || lcErr));
    throw new Error(`LangChain processing failed: ${lcErr.message || lcErr}`);
  }
}

module.exports = { runChain };
