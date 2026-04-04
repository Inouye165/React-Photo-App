#!/usr/bin/env node

/**
 * Secure Admin Role Assignment Script
 *
 * This script uses the Supabase Service Role Key to securely update a user's
 * app_metadata with an admin role. This is the only secure way to grant admin
 * privileges, as app_metadata is not writable by clients.
 *
 * Usage:
 *   npx tsx server/scripts/set-admin-role.ts <user-id>
 *
 * Example:
 *   npx tsx server/scripts/set-admin-role.ts 550e8400-e29b-41d4-a716-446655440000
 *
 * Environment Variables Required:
 *   - SUPABASE_URL: Your Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key (KEEP SECRET!)
 */

import { createClient } from '@supabase/supabase-js';

import '../env';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function exitWithError(...lines: string[]): never {
  lines.forEach((line) => console.error(line));
  process.exit(1);
}

if (!SUPABASE_URL) {
  exitWithError(
    'ERROR: SUPABASE_URL environment variable is not set',
    '   Please set it in your .env file or environment'
  );
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  exitWithError(
    'ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is not set',
    '   This key is required to modify app_metadata',
    '   Find it in: Supabase Dashboard -> Settings -> API -> service_role key',
    '   WARNING: Keep this key secret! Never commit it to version control.'
  );
}

const userId = process.argv[2];

if (!userId) {
  exitWithError(
    'ERROR: User ID is required',
    '',
    'Usage:',
    '  npx tsx server/scripts/set-admin-role.ts <user-id>',
    '',
    'Example:',
    '  npx tsx server/scripts/set-admin-role.ts 550e8400-e29b-41d4-a716-446655440000',
    '',
    'To find a user ID:',
    '  1. Go to Supabase Dashboard -> Authentication -> Users',
    '  2. Click on the user to see their UUID'
  );
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuidRegex.test(userId)) {
  exitWithError(
    'ERROR: Invalid user ID format',
    '   Expected a UUID like: 550e8400-e29b-41d4-a716-446655440000',
    `   Received: ${userId}`
  );
}

async function setAdminRole(): Promise<void> {
  console.log('Initializing Supabase Admin Client...');

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    console.log(`Fetching user: ${userId}`);

    const { data: userResult, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (getUserError) {
      exitWithError(`ERROR: Failed to fetch user: ${getUserError.message}`);
    }

    const authUser = userResult?.user;
    if (!authUser) {
      exitWithError(`ERROR: User not found with ID: ${userId}`);
    }

    console.log('User found:', authUser.email || '(no email)');
    console.log('');
    console.log('Current metadata:');
    console.log('  user_metadata:', JSON.stringify(authUser.user_metadata || {}, null, 2));
    console.log('  app_metadata:', JSON.stringify(authUser.app_metadata || {}, null, 2));
    console.log('');

    console.log('Setting admin role in app_metadata (secure, server-controlled)...');

    const { data: updatedUserResult, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: {
        role: 'admin',
      },
    });

    if (updateError) {
      exitWithError(`ERROR: Failed to update user: ${updateError.message}`);
    }

    const updatedUser = updatedUserResult.user;
    console.log('SUCCESS: Admin role granted!');
    console.log('');
    console.log('Updated metadata:');
    console.log('  app_metadata:', JSON.stringify(updatedUser?.app_metadata || {}, null, 2));
    console.log('');
    console.log('User', updatedUser?.email || '(no email)', 'is now an admin!');
    console.log('');
    console.log('IMPORTANT: The user must refresh their token (re-login) for changes to take effect.');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('UNEXPECTED ERROR:', message);
    console.error(error);
    process.exit(1);
  }
}

void setAdminRole();