#!/usr/bin/env node

/**
 * Secure Admin Role Assignment Script
 * 
 * This script uses the Supabase Service Role Key to securely update a user's
 * app_metadata with an admin role. This is the ONLY secure way to grant admin
 * privileges, as app_metadata is not writable by clients.
 * 
 * Usage:
 *   node server/scripts/set-admin-role.js <user-id>
 * 
 * Example:
 *   node server/scripts/set-admin-role.js 550e8400-e29b-41d4-a716-446655440000
 * 
 * Environment Variables Required:
 *   - SUPABASE_URL: Your Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key (KEEP SECRET!)
 */

const { createClient } = require('@supabase/supabase-js');

// Validate environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error('❌ ERROR: SUPABASE_URL environment variable is not set');
  console.error('   Please set it in your .env file or environment');
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
  console.error('   This key is required to modify app_metadata');
  console.error('   Find it in: Supabase Dashboard → Settings → API → service_role key');
  console.error('   ⚠️  WARNING: Keep this key secret! Never commit it to version control.');
  process.exit(1);
}

// Get user ID from command line
const userId = process.argv[2];

if (!userId) {
  console.error('❌ ERROR: User ID is required');
  console.error('');
  console.error('Usage:');
  console.error('  node server/scripts/set-admin-role.js <user-id>');
  console.error('');
  console.error('Example:');
  console.error('  node server/scripts/set-admin-role.js 550e8400-e29b-41d4-a716-446655440000');
  console.error('');
  console.error('To find a user ID:');
  console.error('  1. Go to Supabase Dashboard → Authentication → Users');
  console.error('  2. Click on the user to see their UUID');
  process.exit(1);
}

// Validate UUID format (basic check)
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuidRegex.test(userId)) {
  console.error('❌ ERROR: Invalid user ID format');
  console.error('   Expected a UUID like: 550e8400-e29b-41d4-a716-446655440000');
  console.error('   Received:', userId);
  process.exit(1);
}

async function setAdminRole() {
  console.log('🔧 Initializing Supabase Admin Client...');
  
  // Create admin client with service role key
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    console.log(`📋 Fetching user: ${userId}`);
    
    // First, verify the user exists
    const { data: user, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (getUserError) {
      console.error('❌ ERROR: Failed to fetch user:', getUserError.message);
      process.exit(1);
    }
    
    if (!user || !user.user) {
      console.error('❌ ERROR: User not found with ID:', userId);
      process.exit(1);
    }
    
    console.log('✅ User found:', user.user.email);
    console.log('');
    console.log('Current metadata:');
    console.log('  user_metadata:', JSON.stringify(user.user.user_metadata || {}, null, 2));
    console.log('  app_metadata:', JSON.stringify(user.user.app_metadata || {}, null, 2));
    console.log('');
    
    // Update app_metadata with admin role
    console.log('🔐 Setting admin role in app_metadata (secure, server-controlled)...');
    
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        app_metadata: {
          role: 'admin'
        }
      }
    );
    
    if (updateError) {
      console.error('❌ ERROR: Failed to update user:', updateError.message);
      process.exit(1);
    }
    
    console.log('✅ SUCCESS: Admin role granted!');
    console.log('');
    console.log('Updated metadata:');
    console.log('  app_metadata:', JSON.stringify(updatedUser.user.app_metadata, null, 2));
    console.log('');
    console.log('🎉 User', updatedUser.user.email, 'is now an admin!');
    console.log('');
    console.log('⚠️  IMPORTANT: The user must refresh their token (re-login) for changes to take effect.');
    
  } catch (error) {
    console.error('❌ UNEXPECTED ERROR:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
setAdminRole();
