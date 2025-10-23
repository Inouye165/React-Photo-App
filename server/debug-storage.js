const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log('Environment check:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Missing');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Set' : 'Missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing');

// Test with anon key
const supabaseAnon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Test with service role key
const supabaseService = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testStorage() {
  console.log('\n--- Testing with Anon Key ---');
  try {
    const { data: _data, error } = await supabaseAnon.storage.from('photos').list('', { limit: 1 });
    if (error) {
      console.log('❌ Anon key error:', error.message);
    } else {
      console.log('✅ Anon key can list files');
    }
  } catch (err) {
    console.log('❌ Anon key exception:', err.message);
  }

  console.log('\n--- Testing with Service Role Key ---');
  try {
    const { data: _data2, error } = await supabaseService.storage.from('photos').list('', { limit: 1 });
    if (error) {
      console.log('❌ Service key error:', error.message);
    } else {
      console.log('✅ Service key can list files');
    }
  } catch (err) {
    console.log('❌ Service key exception:', err.message);
  }

  console.log('\n--- Testing upload with Service Role Key ---');
  try {
    const testContent = Buffer.from('test', 'utf8');
    const { data, error } = await supabaseService.storage
      .from('photos')
      .upload('test-upload.txt', testContent, {
        contentType: 'text/plain',
        upsert: true
      });
    
    if (error) {
      console.log('❌ Service key upload error:', error.message);
      console.log('Error details:', error);
    } else {
      console.log('✅ Service key can upload files');
      console.log('Upload path:', data.path);
      
      // Clean up
      await supabaseService.storage.from('photos').remove(['test-upload.txt']);
      console.log('✅ Test file cleaned up');
    }
  } catch (err) {
    console.log('❌ Service key upload exception:', err.message);
  }
}

testStorage();