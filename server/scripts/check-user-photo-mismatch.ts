#!/usr/bin/env node

/**
 * List all users and photos with mismatched user_ids.
 */

import type { Knex } from 'knex';
import knexFactory from 'knex';

import '../env';
const knexConfig = require('../knexfile') as Record<string, Knex.Config>;

type UserRow = {
  id: string;
};

type CountRow = {
  count?: string | number;
};

const db = knexFactory(knexConfig.development);

async function checkUserPhotoMismatch(): Promise<void> {
  try {
    console.log('\n=== Checking User/Photo Consistency ===\n');

    const users = await db<UserRow>('users').select('id');
    console.log(`Found ${users.length} users:`);
    users.forEach((user) => console.log(`  - ID: ${user.id}`));

    const photoUserIds = await db('photos').distinct('user_id').pluck<string | null>('user_id');
    console.log(`\nFound ${photoUserIds.length} unique user_ids in photos table`);

    const validUserIds = new Set(users.map((user) => user.id));
    const orphanedUserIds = photoUserIds.filter(
      (photoUserId): photoUserId is string => typeof photoUserId === 'string' && !validUserIds.has(photoUserId)
    );

    if (orphanedUserIds.length > 0) {
      console.log(`\nFound ${orphanedUserIds.length} orphaned user_ids (no matching user):`);

      for (const orphanedId of orphanedUserIds) {
        const countRows = await db('photos').where('user_id', orphanedId).count('id as count') as CountRow[];
        console.log(`  - ${orphanedId}: ${Number(countRows[0]?.count || 0)} photos`);
      }
    } else {
      console.log('\nAll photos have valid user_ids');
    }

    console.log('\n=== Check Complete ===\n');
  } catch (error: unknown) {
    console.error('Error:', error);
  } finally {
    await db.destroy();
  }
}

void checkUserPhotoMismatch();