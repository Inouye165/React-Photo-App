/**
 * Pre-test key validation.
 * Validates that required API keys are present and functional before running tests.
 */

import '../env';

type GooglePlacesResponse = {
  status?: string;
  error_message?: string;
};

function shouldTreatOpenAIValidationFailureAsWarning(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';
  const normalized = `${name} ${message}`.toLowerCase();

  return ['abort', 'fetch failed', 'timed out', 'timeout', 'econnreset', 'enotfound', 'eai_again', 'network', 'socket']
    .some((token) => normalized.includes(token));
}

async function validateKeys(): Promise<void> {
  const errors: string[] = [];
  const requiredKeys = ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'JWT_SECRET'];

  for (const key of requiredKeys) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      errors.push(`Missing required key: ${key}`);
    }
  }

  if (errors.length > 0) {
    console.error('❌ Key validation failed:');
    errors.forEach((err) => console.error('  -', err));
    process.exit(1);
  }

  if (process.env.OPENAI_API_KEY && !process.env.CI) {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        errors.push(`OPENAI_API_KEY is invalid (HTTP ${response.status})`);
      }
    } catch (error) {
      if (shouldTreatOpenAIValidationFailureAsWarning(error)) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️  Skipping live OPENAI_API_KEY validation: ${message}`);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to validate OPENAI_API_KEY: ${message}`);
      }
    }
  }

  if ((process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY) && !process.env.CI) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
    try {
      const testUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=47.6205,-122.3493&radius=500&type=park&key=${apiKey}`;
      const response = await fetch(testUrl);
      const data = (await response.json()) as GooglePlacesResponse;

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.warn(`⚠️  Warning: GOOGLE_MAPS_API_KEY may be invalid (status: ${String(data.status)})`);
        if (data.error_message) {
          console.warn(`   ${data.error_message}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️  Warning: Failed to validate GOOGLE_MAPS_API_KEY: ${message}`);
    }
  }

  if (errors.length > 0) {
    console.error('\n❌ Key validation failed:');
    errors.forEach((err) => console.error('  -', err));
    process.exit(1);
  }

  if (process.env.CI) {
    console.log('✅ All required API keys present (CI mode - skipped validation)');
  } else {
    console.log('✅ All required API keys validated');
  }
}

validateKeys().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('❌ Key validation error:', message);
  process.exit(1);
});