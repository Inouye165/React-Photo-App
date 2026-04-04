import './env';
import knexFactory, { type Knex } from 'knex';

const knexConfig = require('./knexfile') as Record<string, Knex.Config>;
const knex = knexFactory(knexConfig.development);

const TARGET_EMAIL = 'inouye165@gmail.com';

type UserRow = {
  id: string;
  email: string;
};

type CountRow = {
  count: string | number;
};

async function assignPhotos(): Promise<void> {
  try {
    console.log(`Looking for user with email: ${TARGET_EMAIL}...`);

    const user = await knex<UserRow>('users').where({ email: TARGET_EMAIL }).first();

    if (!user) {
      console.error(`User ${TARGET_EMAIL} not found!`);
      process.exitCode = 1;
      return;
    }

    console.log(`Found user: ${user.email} (ID: ${user.id})`);

    const totalPhotos = await knex<CountRow>('photos').count<{ count: string | number }>('* as count').first();
    console.log(`Total photos in database: ${totalPhotos?.count ?? 0}`);

    const updated = await knex('photos').update({ user_id: user.id });

    console.log(`Successfully assigned ${updated} photos to ${TARGET_EMAIL}`);
  } catch (error) {
    console.error('Error assigning photos:', error);
    process.exitCode = 1;
  } finally {
    await knex.destroy();
  }
}

void assignPhotos();