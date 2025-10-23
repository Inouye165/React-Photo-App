const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testThumbnailUrls() {
  try {
    console.log('🖼️  Testing thumbnail URLs...\n');
    
    // List thumbnail files
    const { data: thumbnails, error } = await supabase.storage
      .from('photos')
      .list('thumbnails', { limit: 5 });
    
    if (error) {
      console.error('❌ Error listing thumbnails:', error);
      return;
    }
    
    if (!thumbnails || thumbnails.length === 0) {
      console.log('❌ No thumbnails found');
      return;
    }
    
    console.log(`📁 Found ${thumbnails.length} thumbnails:`);
    
    for (const thumb of thumbnails) {
      console.log(`   📷 ${thumb.name}`);
      
      // Test public URL
      const { data: publicUrl } = supabase.storage
        .from('photos')
        .getPublicUrl(`thumbnails/${thumb.name}`);
      
      console.log(`   🔗 Public URL: ${publicUrl.publicUrl}`);
      
      // Test direct download (this should work with service role)
      const { data: downloadData, error: downloadError } = await supabase.storage
        .from('photos')
        .download(`thumbnails/${thumb.name}`);
      
      if (downloadError) {
        console.log(`   ❌ Download error: ${downloadError.message}`);
      } else {
        console.log(`   ✅ Download works (size: ${downloadData.size} bytes)`);
      }
      
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testThumbnailUrls();