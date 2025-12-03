/**
 * Verification Script: Test Supabase Service Role Key for Upload Permissions
 * 
 * This script validates that the SUPABASE_SERVICE_ROLE_KEY is properly configured
 * and can bypass RLS policies to upload files to storage.
 */

require('../env'); // Load env vars
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('\n🔍 Checking Supabase Admin Access Configuration...\n');
console.log(`SUPABASE_URL: ${url ? '✅ Present' : '❌ Missing'}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY: ${key ? '✅ Present' : '❌ Missing'}`);

if (!url) {
  console.error('\n❌ FAILURE: SUPABASE_URL is missing from env.');
  process.exit(1);
}

if (!key) {
  console.error('\n❌ FAILURE: SUPABASE_SERVICE_ROLE_KEY is missing from env.');
  console.error('   The server will fall back to ANON_KEY, which cannot bypass RLS policies.');
  console.error('   Uploads will fail with "new row violates row-level security policy"');
  process.exit(1);
}

const supabase = createClient(url, key);

async function testUploadPermission() {
  const fileName = `test-upload-${Date.now()}.txt`;
  console.log(`\n📤 Attempting to upload ${fileName} using Service Role Key...`);
  
  try {
    const { data, error } = await supabase.storage
      .from('photos')
      .upload(`working/${fileName}`, 'test content from verify-upload-config.js', {
        contentType: 'text/plain',
        upsert: true
      });

    if (error) {
      console.error('\n❌ UPLOAD FAILED:');
      console.error('   Error:', error.message);
      console.error('   Status:', error.status);
      console.error('   StatusCode:', error.statusCode);
      console.error('\n   This indicates the Service Role Key is either:');
      console.error('   1. Invalid/expired');
      console.error('   2. Not properly configured in Supabase');
      console.error('   3. The storage bucket has additional restrictions');
      process.exit(1);
    } else {
      console.log('✅ UPLOAD SUCCESS! Service Role Key is working correctly.');
      console.log(`   Uploaded to: ${data.path}`);
      
      // Cleanup
      console.log('\n🧹 Cleaning up test file...');
      const { error: deleteError } = await supabase.storage.from('photos').remove([`working/${fileName}`]);
      
      if (deleteError) {
        console.warn('⚠️  Cleanup warning:', deleteError.message);
      } else {
        console.log('✅ Cleanup successful.');
      }
      
      console.log('\n✅ CONFIGURATION VERIFIED: Ready for production uploads!\n');
    }
  } catch (err) {
    console.error('\n❌ UNEXPECTED ERROR:');
    console.error(err);
    process.exit(1);
  }
}

testUploadPermission();
