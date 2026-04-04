#!/usr/bin/env node

/**
 * Diagnostic script to check photo access issues.
 * Usage: npx tsx server/scripts/diagnose-photo-access.ts <photoId>
 */

import type { Knex } from 'knex';
import knexFactory from 'knex';

import '../env';
const knexConfig = require('../knexfile') as Record<string, Knex.Config>;

type PhotoRow = {
  id: string | number;
  filename: string | null;
  state: string | null;
  storage_path: string | null;
  user_id: string | null;
  file_size: number | null;
  hash: string | null;
};

type UserRow = {
  email: string | null;
  username: string | null;
};

const db = knexFactory(knexConfig.development);

async function diagnosePhotoAccess(photoId: string): Promise<void> {
  try {
    console.log(`\n=== Diagnosing Photo ID: ${photoId} ===\n`);

    const photo = await db<PhotoRow>('photos').where('id', photoId).first();
    if (!photo) {
      console.log('Photo not found in database');
      return;
    }

    console.log('Photo found in database:');
    console.log(`  - Filename: ${photo.filename}`);
    console.log(`  - State: ${photo.state}`);
    console.log(`  - Storage Path: ${photo.storage_path}`);
    console.log(`  - User ID: ${photo.user_id}`);
    console.log(`  - File Size: ${photo.file_size}`);
    console.log(`  - Hash: ${photo.hash}`);

    if (!photo.storage_path && !photo.filename) {
      console.log('\nNo storage_path or filename found - file cannot be located');
      return;
    }

    const expectedPath = photo.storage_path || `${photo.state}/${photo.filename}`;
    console.log(`\nExpected storage path: ${expectedPath}`);

    const user = photo.user_id
      ? await db<UserRow>('users').where('id', photo.user_id).first()
      : undefined;

    if (!user) {
      console.log(`\nUser ${photo.user_id} not found in database`);
    } else {
      console.log('\nOwner user found:');
      console.log(`  - Email: ${user.email}`);
      console.log(`  - Username: ${user.username || 'N/A'}`);
    }

    console.log('\n=== Diagnosis Complete ===\n');
  } catch (error: unknown) {
    console.error('Error during diagnosis:', error);
  } finally {
    await db.destroy();
  }
}

const photoId = process.argv[2];
if (!photoId) {
  console.error('Usage: npx tsx server/scripts/diagnose-photo-access.ts <photoId>');
  process.exit(1);
}

void diagnosePhotoAccess(photoId);