#!/usr/bin/env node
/**
 * Backfill users table with user_ids from photos table.
 *
 * This script verifies that all user_ids referenced in the photos table
 * have corresponding records in the users table.
 */

import knexFactory from 'knex';

import '../env';

const knexConfig = require('../knexfile') as { development: Parameters<typeof knexFactory>[0] };

type UserInsert = {
  id: string;
  preferences: string;
  created_at: string;
  updated_at: string;
};

const db = knexFactory(knexConfig.development);

async function backfillUsers(): Promise<void> {
  try {
    console.log('\n=== Backfilling Users Table ===\n');

    const photoUserIds = await db('photos').distinct('user_id').whereNotNull('user_id').pluck<string>('user_id');
    console.log(`Found ${photoUserIds.length} unique user_ids in photos table`);

    const existingUserIds = await db('users').pluck<string>('id');
    console.log(`Found ${existingUserIds.length} existing users in users table`);

    const existingUserIdSet = new Set(existingUserIds);
    const missingUserIds = photoUserIds.filter((id) => !existingUserIdSet.has(id));

    if (missingUserIds.length === 0) {
      console.log('\n✅ All user_ids are already in users table');
      return;
    }

    console.log(`\n🔧 Inserting ${missingUserIds.length} missing users...`);

    const timestamp = new Date().toISOString();
    const usersToInsert: UserInsert[] = missingUserIds.map((id) => ({
      id,
      preferences: JSON.stringify({}),
      created_at: timestamp,
      updated_at: timestamp,
    }));

    await db('users').insert(usersToInsert);

    console.log(`✅ Successfully inserted ${missingUserIds.length} users`);

    const finalCount = await db('users').count<{ count: string | number }>('* as count');
    console.log(`\n📊 Total users in table: ${String(finalCount[0]?.count ?? 0)}`);

    console.log('\n=== Backfill Complete ===\n');
  } catch (error) {
    console.error('❌ Error during backfill:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

void backfillUsers();