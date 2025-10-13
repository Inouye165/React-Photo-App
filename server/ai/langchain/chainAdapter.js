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

// Optional LangChain adapter. Enable with USE_LANGCHAIN=true in .env. This
// attempts to call the tiny adapter wrapper; if that fails, the code will
// gracefully fall back to the simpleChain or OpenAI client.
let useLangChain = (process.env.USE_LANGCHAIN || 'false').toLowerCase() === 'true';
let runLangChain;
if (useLangChain) {
  try {
    ({ runLangChain } = require('./langchainAdapter'));
  } catch (e) {
    console.warn('Failed to load LangChain adapter, falling back', e && (e.message || e));
    useLangChain = false;
  }
}

async function runChain({ messages, model = 'gpt-4o', max_tokens = 1500, temperature = 0.25, // additional args are ignored by simple chain
  // allow passing filePath/metadata for simpleChain mode
  filePath, metadata, gps, device } = {}) {
  // If LangChain adapter enabled, prefer it first
  if (useLangChain) {
    try {
      const lcResp = await runLangChain({ messages, model, filePath, metadata, gps, device });
      return lcResp;
    } catch (lcErr) {
      console.warn('LangChain adapter failed, falling back', lcErr && (lcErr.message || lcErr));
      // fallthrough to other paths
    }
  }

  if (useSimple) {
    // runSimpleChain returns { messages, ctx }
    const out = await runSimpleChain({ filePath, metadata, gps, device });
    // Now call OpenAI with the generated messages so the response is a real
    // completion. Attach the chain context as `_ctx` for downstream use.
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
    const response = await openai.chat.completions.create({ model, messages: out.messages, max_tokens, temperature });
    // attach ctx for debugging/inspection
    response._ctx = { ...out.ctx, method: 'simplechain' };
    return response;
  }

  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  const response = await openai.chat.completions.create({ model, messages, max_tokens, temperature });
  response._ctx = { method: 'openai' };
  return response;
}

module.exports = { runChain };
