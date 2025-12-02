#!/usr/bin/env node
/**
 * List all users and photos with mismatched user_ids
 */

require('../env');
const knexConfig = require('../knexfile');
const knex = require('knex')(knexConfig.development);

async function checkUserPhotoMismatch() {
  try {
    console.log('\n=== Checking User/Photo Consistency ===\n');

    // Get all users
    const users = await knex('users').select('id');
    console.log(`✅ Found ${users.length} users:`);
    users.forEach(u => console.log(`  - ID: ${u.id})`));

    // Get all unique user_ids from photos
    const photoUserIds = await knex('photos')
      .distinct('user_id')
      .pluck('user_id');
    
    console.log(`\n📸 Found ${photoUserIds.length} unique user_ids in photos table`);

    // Find orphaned photos (user_id not in users table)
    const userIds = users.map(u => u.id);
    const orphanedUserIds = photoUserIds.filter(id => !userIds.includes(id));

    if (orphanedUserIds.length > 0) {
      console.log(`\n❌ Found ${orphanedUserIds.length} orphaned user_ids (no matching user):`);
      
      for (const orphanedId of orphanedUserIds) {
        const count = await knex('photos').where('user_id', orphanedId).count('* as count');
        console.log(`  - ${orphanedId}: ${count[0].count} photos`);
      }
    } else {
      console.log('\n✅ All photos have valid user_ids');
    }

    console.log('\n=== Check Complete ===\n');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await knex.destroy();
  }
}

checkUserPhotoMismatch();
