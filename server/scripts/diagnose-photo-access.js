#!/usr/bin/env node
/**
 * Diagnostic script to check photo access issues
 * Usage: node scripts/diagnose-photo-access.js <photoId>
 */

require('../env');
const knexConfig = require('../knexfile');
const knex = require('knex')(knexConfig.development);

async function diagnosePhotoAccess(photoId) {
  try {
    console.log(`\n=== Diagnosing Photo ID: ${photoId} ===\n`);

    // Get photo record
    const photo = await knex('photos').where('id', photoId).first();
    
    if (!photo) {
      console.log('❌ Photo not found in database');
      return;
    }

    console.log('✅ Photo found in database:');
    console.log(`  - Filename: ${photo.filename}`);
    console.log(`  - State: ${photo.state}`);
    console.log(`  - Storage Path: ${photo.storage_path}`);
    console.log(`  - User ID: ${photo.user_id}`);
    console.log(`  - File Size: ${photo.file_size}`);
    console.log(`  - Hash: ${photo.hash}`);

    // Check if storage_path exists
    if (!photo.storage_path && !photo.filename) {
      console.log('\n❌ No storage_path or filename found - file cannot be located');
      return;
    }

    const expectedPath = photo.storage_path || `${photo.state}/${photo.filename}`;
    console.log(`\n📁 Expected storage path: ${expectedPath}`);

    // Check if user exists
    const user = await knex('users').where('id', photo.user_id).first();
    if (!user) {
      console.log(`\n❌ User ${photo.user_id} not found in database`);
    } else {
      console.log(`\n✅ Owner user found:`);
      console.log(`  - Email: ${user.email}`);
      console.log(`  - Username: ${user.username || 'N/A'}`);
    }

    console.log('\n=== Diagnosis Complete ===\n');
  } catch (error) {
    console.error('Error during diagnosis:', error);
  } finally {
    await knex.destroy();
  }
}

const photoId = process.argv[2];
if (!photoId) {
  console.error('Usage: node scripts/diagnose-photo-access.js <photoId>');
  process.exit(1);
}

diagnosePhotoAccess(photoId);
