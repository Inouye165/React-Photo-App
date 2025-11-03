const _OpenAI = require('openai');
const path = require('path');
require(path.join(__dirname, '..', '..', 'env'));
const logger = require('../../logger');

// Optional simple chain implemented locally to allow an incremental LangChain
// migration without pulling in the LangChain SDK yet. Enable with
// USE_SIMPLE_CHAIN=true in .env to exercise the scaffold.
let useSimple = (process.env.USE_SIMPLE_CHAIN || 'false').toLowerCase() === 'true';

// LangChain is now REQUIRED for processing - no fallbacks allowed
// Set USE_LANGCHAIN=false to disable LangChain (will throw error)
let useLangChain = (process.env.USE_LANGCHAIN !== 'false') && !useSimple;
let runLangChain;
if (useLangChain) {
  try {
    ({ runLangChain } = require('./langchainAdapter'));
  } catch (e) {
    logger.fatal('CRITICAL: Failed to load LangChain adapter - LangChain is required for processing', e && (e.message || e));
    throw new Error('LangChain adapter failed to load - cannot proceed without LangChain');
  }
}

async function runChain({ messages, model = 'gpt-4o', _max_tokens = 1500, _temperature = 0.25, // additional args are ignored by simple chain
  // allow passing filePath/metadata for simpleChain mode
  filePath, metadata, gps, device } = {}) {
  
  // Use simple chain if enabled
  if (useSimple) {
    logger.info('ChainAdapter: Using Simple Chain path');
    const { runSimpleChain } = require('./simpleChain');
    const simpleResult = await runSimpleChain({ filePath, metadata, gps, device });
    
    // Convert simple chain result to OpenAI-like format
    return {
      choices: [{ message: { content: 'FAKE_OPENAI_RESPONSE' } }],
      _ctx: simpleResult.ctx
    };
  }
  
  // LangChain is REQUIRED - no fallbacks allowed
  if (!useLangChain) {
    throw new Error('LangChain is required for processing but is disabled. Set USE_LANGCHAIN=true or remove USE_LANGCHAIN=false from environment.');
  }

  logger.info('ChainAdapter: Using REQUIRED LangChain path');
  try {
    const lcResp = await runLangChain({ messages, model, filePath, metadata, gps, device });
    return lcResp;
  } catch (lcErr) {
    logger.fatal('CRITICAL: LangChain processing failed - no fallbacks available', lcErr && (lcErr.message || lcErr));
    throw new Error(`LangChain processing failed: ${lcErr.message || lcErr}`);
  }
}

module.exports = { runChain };
