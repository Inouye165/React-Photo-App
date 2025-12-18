/**
 * Pre-test key validation for frontend tests
 * Validates that required API keys are present before running tests
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const inheritedOpenAIKey = process.env.OPENAI_API_KEY;
let openAIKeyLoadedFromEnvFile = false;

function isTruthy(value) {
  if (!value) return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase());
}

// Load repo-root .env first, then allow server/.env to fill any missing values.
// Locally, prefer .env over shell vars (common when a placeholder is set).
// Default: prefer env files over inherited shell env vars.
// You can opt out (e.g., in CI) by setting DOTENV_OVERRIDE=0.
const dotenvOverride = process.env.DOTENV_OVERRIDE == null
  ? true
  : isTruthy(process.env.DOTENV_OVERRIDE);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = dotenv.parse(raw);

  for (const [key, value] of Object.entries(parsed)) {
    const alreadySet = Object.prototype.hasOwnProperty.call(process.env, key) && process.env[key] !== undefined;
    if (!alreadySet || dotenvOverride) {
      process.env[key] = value;
      if (key === 'OPENAI_API_KEY') openAIKeyLoadedFromEnvFile = true;
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), 'server', '.env'));

async function validateOpenAIKeyLive(apiKey) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch is not available in this Node runtime');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_500);

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    // Drain body to avoid leaving sockets/handles dangling on Windows.
    try {
      await response.text();
    } catch {
      // ignore
    }

    return { ok: response.ok, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

async function validateKeys() {
  const errors = [];
  
  // Required keys for frontend
  const requiredKeys = [
    'OPENAI_API_KEY',
    'VITE_API_URL'
  ];
  
  // Check for missing keys
  for (const key of requiredKeys) {
    if (!process.env[key] || process.env[key].trim() === '') {
      errors.push(`Missing required key: ${key}`);
    }
  }

  // If critical keys are missing, fail.
  if (errors.length > 0) {
    console.error('❌ Frontend key validation failed:');
    errors.forEach((err) => console.error('  -', err));
    return { ok: false };
  }

  // Live validation is enabled by default. You may explicitly disable by setting
  // VALIDATE_OPENAI_API_KEY_LIVE=0 (not recommended).
  const liveValidate = process.env.VALIDATE_OPENAI_API_KEY_LIVE == null
    ? true
    : isTruthy(process.env.VALIDATE_OPENAI_API_KEY_LIVE);

  if (liveValidate && process.env.OPENAI_API_KEY) {
    try {
      // Helpful hint: If OPENAI_API_KEY is coming from the shell, it may mask .env values.
      if (inheritedOpenAIKey && inheritedOpenAIKey === process.env.OPENAI_API_KEY && !openAIKeyLoadedFromEnvFile) {
        console.log(
          'ℹ️  Using OPENAI_API_KEY from environment. Unset it to use .env/server/.env values.'
        );
      }

      const result = await validateOpenAIKeyLive(process.env.OPENAI_API_KEY);
      if (!result.ok) {
        errors.push(`OPENAI_API_KEY is invalid (HTTP ${result.status})`);
      }
    } catch (error) {
      errors.push(`Failed to validate OPENAI_API_KEY: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    console.error('\n❌ Frontend key validation failed:');
    errors.forEach((err) => console.error('  -', err));
    return { ok: false };
  }

  console.log('✅ All required frontend API keys validated');
  return { ok: true };
}

validateKeys()
  .then((result) => {
    if (!result.ok) process.exitCode = 1;
  })
  .catch((error) => {
    console.error('❌ Frontend key validation error:', error.message);
    process.exitCode = 1;
  });
