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

const environment = process.env.NODE_ENV || 'development';
const db = knexFactory(knexConfig[environment]);

async function main(): Promise<void> {
  const userId = process.argv[2];
  if (!userId) {
    console.error('Usage: npx tsx server/scripts/adopt-orphans.ts <userId>');
    process.exit(1);
  }

  try {
    const user = await db<UserRow>('users').where({ id: userId }).first();
    if (!user) {
      console.error(`User with id ${userId} does not exist.`);
      process.exit(1);
    }

    const orphanCount = await db('photos').whereNull('user_id').count('id as count').first() as CountRow | undefined;
    const count = Number(orphanCount?.count || 0);
    if (count === 0) {
      console.log('No orphan photos found.');
      process.exit(0);
    }

    const updated = await db('photos').whereNull('user_id').update({ user_id: userId });
    console.log(`Updated ${updated} orphan photos to user_id ${userId}.`);
    process.exit(0);
  } finally {
    await db.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error('Error:', error);
  process.exit(1);
});