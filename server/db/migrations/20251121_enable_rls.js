// Migration to enable Row Level Security (RLS) on critical tables
exports.up = async function(knex) {
  const client = knex.client.config.client;
  if (client === 'pg' || client === 'postgresql') {
    await knex.raw('ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;');
    await knex.raw('ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;');
    await knex.raw('ALTER TABLE "knex_migrations" ENABLE ROW LEVEL SECURITY;');
    await knex.raw('ALTER TABLE "knex_migrations_lock" ENABLE ROW LEVEL SECURITY;');
    // Optionally enable RLS on collectibles if it exists
    try {
      await knex.raw('ALTER TABLE "collectibles" ENABLE ROW LEVEL SECURITY;');
    } catch {
      // Table may not exist, ignore error
    }
  }
};

exports.down = async function(knex) {
  const client = knex.client.config.client;
  if (client === 'pg' || client === 'postgresql') {
    await knex.raw('ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;');
    await knex.raw('ALTER TABLE "photos" DISABLE ROW LEVEL SECURITY;');
    await knex.raw('ALTER TABLE "knex_migrations" DISABLE ROW LEVEL SECURITY;');
    await knex.raw('ALTER TABLE "knex_migrations_lock" DISABLE ROW LEVEL SECURITY;');
    // Optionally disable RLS on collectibles if it exists
    try {
      await knex.raw('ALTER TABLE "collectibles" DISABLE ROW LEVEL SECURITY;');
    } catch {
      // Table may not exist, ignore error
    }
  }
};
