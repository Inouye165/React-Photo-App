#!/usr/bin/env node
/**
 * Backfill users table with user_ids from photos table
 * 
 * This script ensures that all user_ids referenced in the photos table
 * have corresponding records in the users table.
 */

require('../env');
const knexConfig = require('../knexfile');
const knex = require('knex')(knexConfig.development);

async function backfillUsers() {
  try {
    console.log('\n=== Backfilling Users Table ===\n');

    // Get all unique user_ids from photos
    const photoUserIds = await knex('photos')
      .distinct('user_id')
      .whereNotNull('user_id')
      .pluck('user_id');
    
    console.log(`Found ${photoUserIds.length} unique user_ids in photos table`);

    // Get existing user_ids from users table
    const existingUserIds = await knex('users').pluck('id');
    console.log(`Found ${existingUserIds.length} existing users in users table`);

    // Find missing user_ids
    const missingUserIds = photoUserIds.filter(id => !existingUserIds.includes(id));

    if (missingUserIds.length === 0) {
      console.log('\n✅ All user_ids are already in users table');
      return;
    }

    console.log(`\n🔧 Inserting ${missingUserIds.length} missing users...`);

    // Insert missing users with default preferences
    const usersToInsert = missingUserIds.map(id => ({
      id,
      preferences: JSON.stringify({}),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    await knex('users').insert(usersToInsert);

    console.log(`✅ Successfully inserted ${missingUserIds.length} users`);
    
    // Verify
    const finalCount = await knex('users').count('* as count');
    console.log(`\n📊 Total users in table: ${finalCount[0].count}`);

    console.log('\n=== Backfill Complete ===\n');
  } catch (error) {
    console.error('❌ Error during backfill:', error);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

backfillUsers();
