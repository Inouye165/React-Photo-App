import './env';
import knexFactory, { type Knex } from 'knex';
import { createClient, type User } from '@supabase/supabase-js';

const knexConfig = require('./knexfile') as Record<string, Knex.Config>;
const knex = knexFactory(knexConfig.development);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_EMAIL = 'inouye165@gmail.com';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase URL or Service Role Key');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

type CountRow = {
  count: string | number;
};

async function assignPhotos(): Promise<void> {
  try {
    console.log(`Looking for Supabase user with email: ${TARGET_EMAIL}...`);

    const { data, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      throw error;
    }

    const user = data.users.find((candidate: User) => candidate.email === TARGET_EMAIL);

    if (!user?.email) {
      console.error(`User ${TARGET_EMAIL} not found in Supabase Auth!`);
      process.exitCode = 1;
      return;
    }

    console.log(`Found Supabase user: ${user.email} (UUID: ${user.id})`);

    const totalPhotos = await knex<CountRow>('photos').count<{ count: string | number }>('* as count').first();
    console.log(`Total photos in database: ${totalPhotos?.count ?? 0}`);

    const updated = await knex('photos').update({ user_id: user.id });

    console.log(`Successfully assigned ${updated} photos to ${TARGET_EMAIL} (UUID: ${user.id})`);
  } catch (error) {
    console.error('Error assigning photos:', error);
    process.exitCode = 1;
  } finally {
    await knex.destroy();
  }
}

void assignPhotos();