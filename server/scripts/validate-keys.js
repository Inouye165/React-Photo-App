/**
 * Pre-test key validation
 * Validates that required API keys are present and functional before running tests
 */

require('../env');

async function validateKeys() {
  const errors = [];
  
  // Required keys that must be present
  const requiredKeys = [
    'OPENAI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'JWT_SECRET'
  ];
  
  // Check for missing keys
  for (const key of requiredKeys) {
    if (!process.env[key] || process.env[key].trim() === '') {
      errors.push(`Missing required key: ${key}`);
    }
  }
  
  // If critical keys are missing, fail immediately
  if (errors.length > 0) {
    console.error('❌ Key validation failed:');
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
  
  // Test Google Maps API key if present (optional but warn if invalid)
  if (process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
    try {
      const testUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=47.6205,-122.3493&radius=500&type=park&key=${apiKey}`;
      const response = await fetch(testUrl);
      const data = await response.json();
      
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.warn(`⚠️  Warning: GOOGLE_MAPS_API_KEY may be invalid (status: ${data.status})`);
        if (data.error_message) {
          console.warn(`   ${data.error_message}`);
        }
      }
    } catch (error) {
      console.warn(`⚠️  Warning: Failed to validate GOOGLE_MAPS_API_KEY: ${error.message}`);
    }
  }
  
  if (errors.length > 0) {
    console.error('\n❌ Key validation failed:');
    errors.forEach(err => console.error('  -', err));
    process.exit(1);
  }
  
  console.log('✅ All required API keys validated');
}

validateKeys().catch(error => {
  console.error('❌ Key validation error:', error.message);
  process.exit(1);
});
