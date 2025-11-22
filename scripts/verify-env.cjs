const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const rootDir = path.resolve(__dirname, '..');
const serverDir = path.join(rootDir, 'server');

function checkEnvFile(filePath, requiredKeys, contextName) {
  console.log(`\nChecking ${contextName} environment (${filePath})...`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌  Missing .env file at ${filePath}`);
    return false;
  }

  const envConfig = dotenv.parse(fs.readFileSync(filePath));
  const missing = [];

  requiredKeys.forEach(key => {
    if (!envConfig[key] || envConfig[key].trim() === '') {
      missing.push(key);
    } else {
      console.log(`✅  ${key} is present`);
    }
  });

  if (missing.length > 0) {
    console.error(`❌  Missing required keys in ${contextName}:`);
    missing.forEach(k => console.error(`    - ${k}`));
    return false;
  }
  
  return true;
}

let success = true;

// 1. Check Frontend (.env in root)
const frontendKeys = [
  'VITE_GOOGLE_MAPS_API_KEY'
];
if (!checkEnvFile(path.join(rootDir, '.env'), frontendKeys, 'Frontend')) {
  success = false;
}

// 2. Check Backend (server/.env)
// Note: Backend needs EITHER GOOGLE_MAPS_API_KEY OR GOOGLE_PLACES_API_KEY
const backendPath = path.join(serverDir, '.env');
if (fs.existsSync(backendPath)) {
  console.log(`\nChecking Backend environment (${backendPath})...`);
  const envConfig = dotenv.parse(fs.readFileSync(backendPath));
  
  // Check Supabase
  const supabaseKeys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  let backendMissing = [];
  supabaseKeys.forEach(key => {
    if (!envConfig[key]) backendMissing.push(key);
    else console.log(`✅  ${key} is present`);
  });

  // Check Google (One of them is required for POI)
  if (!envConfig['GOOGLE_MAPS_API_KEY'] && !envConfig['GOOGLE_PLACES_API_KEY']) {
    console.warn('⚠️  Neither GOOGLE_MAPS_API_KEY nor GOOGLE_PLACES_API_KEY found in backend. POI lookups will be disabled.');
  } else {
    console.log('✅  Google Maps/Places API key is present');
  }

  // Check OpenAI (Optional but recommended for AI features)
  if (!envConfig['OPENAI_API_KEY']) {
    console.warn('⚠️  OPENAI_API_KEY is missing. AI features will be disabled.');
  } else {
    console.log('✅  OPENAI_API_KEY is present');
  }

  if (backendMissing.length > 0) {
    console.error('❌  Missing required backend keys:');
    backendMissing.forEach(k => console.error(`    - ${k}`));
    success = false;
  }
} else {
  console.error(`❌  Missing server/.env file at ${backendPath}`);
  success = false;
}

if (!success) {
  console.error('\nFAILED: Missing required environment variables.');
  process.exit(1);
}

console.log('\nSUCCESS: All critical environment variables are present.');
