#!/usr/bin/env node

// server/scripts/find-orphaned-users.js
//
// Reports "orphaned" app user records: rows in public.users that no longer
// have a corresponding user in Supabase Auth (auth.users).
//
// Safe mode ONLY: this script does not delete anything.

require('../env');

const knexConfig = require('../knexfile');
const knexFactory = require('knex');
const { createClient } = require('@supabase/supabase-js');

function requireEnv(name) {
  const value = process.env[name];
  if (!value || String(value).trim() === '') {
    console.error(`❌ ERROR: Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function createKnex() {
  const env = process.env.NODE_ENV || 'development';
  const cfg = knexConfig[env] || knexConfig.development;
  return knexFactory(cfg);
}

function createSupabaseAdminClient() {
  const url = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function listAllAuthUserIds(supabaseAdmin) {
  const perPage = 1000;
  let page = 1;
  const authUserIds = new Set();

  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      throw new Error(`Supabase listUsers failed on page ${page}: ${error.message || String(error)}`);
    }

    const users = (data && data.users) || [];
    for (const user of users) {
      if (user && user.id) authUserIds.add(String(user.id).toLowerCase());
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return authUserIds;
}

async function main() {
  const shouldFix = process.argv.includes('--fix');

  const knex = createKnex();
  const supabaseAdmin = createSupabaseAdminClient();

  try {
    console.log(
      shouldFix
        ? '🔎 Finding orphaned users (public.users without auth.users) [FIX MODE]...'
        : '🔎 Finding orphaned users (public.users without auth.users)...'
    );

    console.log('📥 Fetching public users...');
    const publicUsers = await knex('users')
      .withSchema('public')
      .select(['id', 'username']);

    console.log(`✅ Loaded ${publicUsers.length} rows from public.users`);

    console.log('📥 Fetching auth users via Supabase Admin API...');
    const authUserIds = await listAllAuthUserIds(supabaseAdmin);
    console.log(`✅ Loaded ${authUserIds.size} users from auth.users`);

    console.log('🧮 Comparing...');
    const orphans = [];

    for (const row of publicUsers) {
      const id = row && row.id ? String(row.id).toLowerCase() : '';
      if (!id) continue;

      if (!authUserIds.has(id)) {
        orphans.push({
          id: row.id,
          username: row.username
        });
      }
    }

    if (orphans.length === 0) {
      console.log('✅ No orphaned public.users rows found.');
      return;
    }

    console.log(`⚠️  Found ${orphans.length} orphaned user(s):`);
    for (const orphan of orphans) {
      console.log(`- ${orphan.username} (${orphan.id})`);
    }

    if (!shouldFix) {
      console.log('\nℹ️  Safe mode: no deletes performed.');
      console.log('   Re-run with: node server/scripts/find-orphaned-users.js --fix');
      return;
    }

    console.log('\n🧹 Deleting orphaned users from public.users...');
    let deletedCount = 0;
    let failedCount = 0;

    for (const orphan of orphans) {
      try {
        const affected = await knex('users')
          .withSchema('public')
          .where({ id: orphan.id })
          .del();

        if (Number(affected) > 0) {
          deletedCount += 1;
          console.log(`🗑️ Deleted orphaned user: ${orphan.username} (${orphan.id})`);
        } else {
          failedCount += 1;
          console.warn(`⚠️  No row deleted for orphan: ${orphan.username} (${orphan.id})`);
        }
      } catch (err) {
        failedCount += 1;
        console.error(
          `❌ Failed to delete orphan: ${orphan.username} (${orphan.id}) - ${err && err.message ? err.message : err}`
        );
      }
    }

    if (failedCount === 0) {
      console.log(`\n✅ Cleanup complete. Removed ${deletedCount} orphaned record(s).`);
    } else {
      console.log(
        `\n⚠️  Cleanup complete with errors. Removed ${deletedCount} orphaned record(s); ${failedCount} failed.`
      );
    }
  } finally {
    await knex.destroy();
  }
}

main().catch((err) => {
  console.error('❌ Script failed:', err && err.message ? err.message : err);
  process.exit(1);
});
