/**
 * Migration: Create Collectibles Schema
 * 
 * This migration creates the full schema for the Smart Collector module:
 * - collectibles: Main table for collectible items linked to photos
 * - collectible_market_data: Historical market/pricing data
 * - collectible_photos: Join table for multiple photos per collectible
 * 
 * NOTE: This uses auth.users for Supabase compatibility. The user_id column
 * references Supabase's auth.users table, not a public.users table.
 * 
 * Security: Row Level Security (RLS) is enabled on all tables with
 * strict user_id = auth.uid() policies.
 * 
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function(knex) {
  const client = knex.client.config.client;
  const isPg = client === 'pg' || client === 'postgresql';

  // Drop existing collectibles table if it exists (from older migration)
  // This is safe because we're in foundation stage
  await knex.schema.dropTableIfExists('collectible_photos');
  await knex.schema.dropTableIfExists('collectible_market_data');
  await knex.schema.dropTableIfExists('collectibles');

  // 1. Create main collectibles table
  await knex.schema.createTable('collectibles', (table) => {
    table.increments('id').primary();
    
    // Foreign key to auth.users table (Supabase Auth)
    // Note: We use raw SQL for cross-schema FK in PostgreSQL
    table.uuid('user_id').notNullable();
    
    // Foreign key to photos table - UNIQUE constraint ensures 1:1 relationship
    table.integer('photo_id')
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable('photos')
      .onDelete('CASCADE');
    
    // Schema versioning for future migrations
    table.integer('schema_version').notNullable().defaultTo(1);
    
    // Categorization
    table.string('category', 100).index();
    table.string('name', 255);
    
    // Condition assessment (1-5 scale)
    table.integer('condition_rank').index();
    table.string('condition_label', 50);
    table.text('condition_def'); // Snapshot of condition definition at time of assessment
    
    // Valuation
    table.decimal('value_min', 12, 2);
    table.decimal('value_max', 12, 2);
    table.string('currency', 3).defaultTo('USD');
    
    // Flexible storage for category-specific attributes
    if (isPg) {
      table.jsonb('specifics').defaultTo('{}');
      table.jsonb('ai_analysis_history').defaultTo('[]');
    } else {
      // SQLite fallback
      table.json('specifics');
      table.json('ai_analysis_history');
    }
    
    // Timestamps
    table.timestamps(true, true);
  });

  // Add FK to auth.users for PostgreSQL (Supabase)
  if (isPg) {
    await knex.raw(`
      ALTER TABLE "collectibles" 
      ADD CONSTRAINT "collectibles_user_id_foreign" 
      FOREIGN KEY ("user_id") REFERENCES "auth"."users" ("id") ON DELETE CASCADE;
    `);
  }

  // 2. Create market data table for price history
  await knex.schema.createTable('collectible_market_data', (table) => {
    table.increments('id').primary();
    
    table.integer('collectible_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('collectibles')
      .onDelete('CASCADE');
    
    // Denormalized user_id for RLS optimization
    table.uuid('user_id').notNullable();
    
    table.decimal('price', 12, 2);
    table.date('date_seen').index();
    table.string('venue', 255);
    table.integer('similarity_score'); // 0-100
    table.string('url', 2048);
    
    table.timestamps(true, true);
  });

  // Add FK to auth.users for PostgreSQL (Supabase)
  if (isPg) {
    await knex.raw(`
      ALTER TABLE "collectible_market_data" 
      ADD CONSTRAINT "collectible_market_data_user_id_foreign" 
      FOREIGN KEY ("user_id") REFERENCES "auth"."users" ("id") ON DELETE CASCADE;
    `);
  }

  // 3. Create join table for multiple photos per collectible
  await knex.schema.createTable('collectible_photos', (table) => {
    table.increments('id').primary();
    
    table.integer('collectible_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('collectibles')
      .onDelete('CASCADE');
    
    table.integer('photo_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('photos')
      .onDelete('CASCADE');
    
    table.uuid('user_id').notNullable();
    
    // Role: 'primary', 'detail', 'damage'
    table.string('role', 20).defaultTo('detail');
    table.text('description');
    
    // Unique constraint: one photo can only have one role per collectible
    table.unique(['collectible_id', 'photo_id']);
    
    table.timestamps(true, true);
  });

  // Add FK to auth.users for PostgreSQL (Supabase)
  if (isPg) {
    await knex.raw(`
      ALTER TABLE "collectible_photos" 
      ADD CONSTRAINT "collectible_photos_user_id_foreign" 
      FOREIGN KEY ("user_id") REFERENCES "auth"."users" ("id") ON DELETE CASCADE;
    `);
  }

  // 5. Enable RLS and create policies (PostgreSQL only)
  if (isPg) {
    // Enable RLS on all new tables
    await knex.raw('ALTER TABLE "collectibles" ENABLE ROW LEVEL SECURITY;');
    await knex.raw('ALTER TABLE "collectible_market_data" ENABLE ROW LEVEL SECURITY;');
    await knex.raw('ALTER TABLE "collectible_photos" ENABLE ROW LEVEL SECURITY;');

    // Drop existing policies if they exist (idempotent)
    const policies = [
      { table: 'collectibles', name: 'collectibles_user_isolation' },
      { table: 'collectible_market_data', name: 'collectible_market_data_user_isolation' },
      { table: 'collectible_photos', name: 'collectible_photos_user_isolation' }
    ];

    for (const { table, name } of policies) {
      try {
        await knex.raw(`DROP POLICY IF EXISTS "${name}" ON "${table}";`);
      } catch {
        // Policy may not exist, continue
      }
    }

    // Create RLS policies for user isolation
    // Each user can only see/modify their own records
    await knex.raw(`
      CREATE POLICY "collectibles_user_isolation" ON "collectibles"
      FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
    `);

    await knex.raw(`
      CREATE POLICY "collectible_market_data_user_isolation" ON "collectible_market_data"
      FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
    `);

    await knex.raw(`
      CREATE POLICY "collectible_photos_user_isolation" ON "collectible_photos"
      FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
    `);

    // Create indexes for common queries
    await knex.raw('CREATE INDEX IF NOT EXISTS "idx_collectibles_user_category" ON "collectibles" (user_id, category);');
    await knex.raw('CREATE INDEX IF NOT EXISTS "idx_collectibles_user_condition" ON "collectibles" (user_id, condition_rank);');
    await knex.raw('CREATE INDEX IF NOT EXISTS "idx_market_data_collectible" ON "collectible_market_data" (collectible_id, date_seen DESC);');
  }
};

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
exports.down = async function(knex) {
  const client = knex.client.config.client;
  const isPg = client === 'pg' || client === 'postgresql';

  // Drop RLS policies first (PostgreSQL only)
  if (isPg) {
    try {
      await knex.raw('DROP POLICY IF EXISTS "collectibles_user_isolation" ON "collectibles";');
      await knex.raw('DROP POLICY IF EXISTS "collectible_market_data_user_isolation" ON "collectible_market_data";');
      await knex.raw('DROP POLICY IF EXISTS "collectible_photos_user_isolation" ON "collectible_photos";');
    } catch {
      // Policies may not exist
    }

    // Drop indexes
    try {
      await knex.raw('DROP INDEX IF EXISTS "idx_collectibles_user_category";');
      await knex.raw('DROP INDEX IF EXISTS "idx_collectibles_user_condition";');
      await knex.raw('DROP INDEX IF EXISTS "idx_market_data_collectible";');
    } catch {
      // Indexes may not exist
    }
  }

  // Drop tables in reverse order of creation (respecting FK constraints)
  await knex.schema.dropTableIfExists('collectible_photos');
  await knex.schema.dropTableIfExists('collectible_market_data');
  await knex.schema.dropTableIfExists('collectibles');
};
