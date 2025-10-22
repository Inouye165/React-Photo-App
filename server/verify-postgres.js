// Verify PostgreSQL migration
const knex = require('knex');
require('dotenv').config();

const postgresConfig = {
  client: 'pg',
  connection: {
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  }
};

async function verifyPostgresData() {
  const db = knex(postgresConfig);
  
  try {
    console.log('=== VERIFYING POSTGRESQL DATABASE ===');
    
    // Check connection
    await db.raw('SELECT 1');
    console.log('✅ PostgreSQL connection successful\n');
    
    // Check tables
    const tables = await db.raw(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);
    console.log('Tables:', tables.rows.map(t => t.table_name));
    
    // Check users
    const users = await db('users').select('*');
    console.log(`\nUsers table: ${users.length} records`);
    users.forEach(user => {
      console.log(`- ID: ${user.id}, Username: ${user.username}, Email: ${user.email}, Role: ${user.role}`);
    });
    
    // Check photos
    const photos = await db('photos').select('*').limit(5);
    const photoCount = await db('photos').count('* as count').first();
    console.log(`\nPhotos table: ${photoCount.count} records (showing first 5)`);
    photos.forEach(photo => {
      console.log(`- ID: ${photo.id}, Filename: ${photo.filename}, State: ${photo.state}`);
    });
    
    // Check migrations
    const migrations = await db('knex_migrations').select('*').orderBy('batch');
    console.log(`\nMigrations applied: ${migrations.length}`);
    migrations.forEach(migration => {
      console.log(`- ${migration.name} (batch ${migration.batch})`);
    });
    
    console.log('\n🎉 PostgreSQL verification complete!');
    
  } catch (error) {
    console.error('❌ Error verifying PostgreSQL:', error.message);
  } finally {
    await db.destroy();
  }
}

verifyPostgresData();