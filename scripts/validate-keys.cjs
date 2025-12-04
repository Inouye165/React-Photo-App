/**
 * Pre-test key validation for frontend tests
 * Validates that required API keys are present before running tests
 */

const { config } = require('dotenv');
config();

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
  
  // If critical keys are missing, fail immediately
  if (errors.length > 0) {
    console.error('❌ Frontend key validation failed:');
    errors.forEach(err => console.error('  -', err));
    process.exit(1);
  }
  
  // Test OpenAI API key if present
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        errors.push(`OPENAI_API_KEY is invalid (HTTP ${response.status})`);
      }
    } catch (error) {
      errors.push(`Failed to validate OPENAI_API_KEY: ${error.message}`);
    }
  }
  
  if (errors.length > 0) {
    console.error('\n❌ Frontend key validation failed:');
    errors.forEach(err => console.error('  -', err));
    process.exit(1);
  }
  
  console.log('✅ All required frontend API keys validated');
}

validateKeys().catch(error => {
  console.error('❌ Frontend key validation error:', error.message);
  process.exit(1);
});
