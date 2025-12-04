/**
 * Local diagnostic script to test API keys
 * 
 * IMPORTANT: This script is for LOCAL USE ONLY
 * - Will not run in CI (exits immediately if CI=true)
 * - Logs are kept to console only, never committed
 * - Use: node scripts/test-keys.js
 */

require('../env'); // Load environment variables

// Prevent running in CI to avoid CodeQL security alerts
if (process.env.CI) {
  console.log('⏭️  Skipping key tests in CI environment');
  process.exit(0);
}

async function testGoogleMapsKey() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!apiKey || apiKey.trim() === '') {
    console.error('❌ GOOGLE_MAPS_API_KEY is missing or empty');
    return false;
  }

  console.log('🔍 Testing Google Maps API key...');

  try {
    // Test with a real request to nearbysearch endpoint
    // Using known coordinates (Seattle Space Needle)
    const testUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=47.6205,-122.3493&radius=500&type=park&key=${apiKey}`;
    
    const response = await fetch(testUrl);
    const data = await response.json();

    if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
      console.log('✅ Google Maps API key is valid');
      console.log('   Status:', data.status);
      console.log('   Results:', data.results?.length || 0, 'places found');
      return true;
    } else {
      console.error('❌ Google Maps API request failed');
      console.error('   Status:', data.status);
      console.error('   Error message:', data.error_message || 'No error message');
      
      // Provide specific guidance based on error
      if (data.status === 'REQUEST_DENIED') {
        console.error('\n💡 Troubleshooting REQUEST_DENIED:');
        console.error('   1. Check if the API key is correct in .env file');
        console.error('   2. Ensure Places API is enabled in Google Cloud Console');
        console.error('   3. Check if billing is enabled for your project');
        console.error('   4. Verify API key restrictions (HTTP referrers, IP addresses)');
        console.error('   5. Check if the API key has Places API permission');
      } else if (data.status === 'OVER_QUERY_LIMIT') {
        console.error('\n💡 Troubleshooting OVER_QUERY_LIMIT:');
        console.error('   1. Check your usage quota in Google Cloud Console');
        console.error('   2. Ensure billing is enabled');
        console.error('   3. Wait and retry if you hit rate limits');
      }
      
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to test Google Maps API:', error.message);
    return false;
  }
}

async function testOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey || apiKey.trim() === '') {
    console.error('❌ OPENAI_API_KEY is missing or empty');
    return false;
  }

  console.log('\n🔍 Testing OpenAI API key...');

  try {
    // Test with a minimal models list request
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ OpenAI API key is valid');
      console.log('   Available models:', data.data?.length || 0);
      return true;
    } else {
      console.error('❌ OpenAI API request failed');
      console.error('   Status:', response.status, response.statusText);
      console.error('   Error:', data.error?.message || 'Authentication failed');
      
      if (response.status === 401) {
        console.error('\n💡 Troubleshooting authentication error:');
        console.error('   1. Check if the API key is correct in .env file');
        console.error('   2. Verify the key hasn\'t been revoked');
        console.error('   3. Ensure the key starts with "sk-"');
      } else if (response.status === 429) {
        console.error('\n💡 Rate limit exceeded - your key is valid but you\'ve hit usage limits');
      }
      
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to test OpenAI API:', error.message);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  API Key Diagnostic Tool (Local Only)');
  console.log('═══════════════════════════════════════\n');

  const googleOk = await testGoogleMapsKey();
  const openaiOk = await testOpenAIKey();

  console.log('\n═══════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════');
  console.log('Google Maps API:', googleOk ? '✅ OK' : '❌ FAILED');
  console.log('OpenAI API:     ', openaiOk ? '✅ OK' : '❌ FAILED');
  console.log('═══════════════════════════════════════\n');

  process.exit(googleOk && openaiOk ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
