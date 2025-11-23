require('./env');
const { createClient } = require('@supabase/supabase-js');
const knexConfig = require('./knexfile');
const knex = require('knex')(knexConfig.development);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_EMAIL = 'inouye165@gmail.com';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase URL or Service Role Key');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function assignPhotos() {
  try {
    console.log(`Looking for Supabase user with email: ${TARGET_EMAIL}...`);
    
    // List users to find the one with the email
    // admin.listUsers() is the way to go
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    
    if (error) {
      throw error;
    }

    const user = users.find(u => u.email === TARGET_EMAIL);

    if (!user) {
      console.error(`User ${TARGET_EMAIL} not found in Supabase Auth!`);
      process.exit(1);
    }

    console.log(`Found Supabase user: ${user.email} (UUID: ${user.id})`);

    // Count photos before update
    const totalPhotos = await knex('photos').count('* as count').first();
    console.log(`Total photos in database: ${totalPhotos.count}`);

    // Update all photos to belong to this user
    const updated = await knex('photos')
      .update({ user_id: user.id });

    console.log(`Successfully assigned ${updated} photos to ${TARGET_EMAIL} (UUID: ${user.id})`);

  } catch (error) {
    console.error('Error assigning photos:', error);
  } finally {
    await knex.destroy();
  }
}

assignPhotos();
