// Test which database is actually being used
const knex = require('knex');
const knexConfig = require('./knexfile');
require('dotenv').config();

async function testDatabaseConnection() {
  const environment = process.env.NODE_ENV || 'development';
  const config = knexConfig[environment];
  const db = knex(config);
  
  try {
    console.log('🔍 TESTING DATABASE CONNECTION');
    console.log('================================');
    console.log(`Environment: ${environment}`);
    console.log('Config:', JSON.stringify(config, null, 2));
    
    // Test connection
    await db.raw('SELECT 1');
    console.log('✅ Database connection successful\n');
    
    // Check what type of database we're connected to
    console.log('🗄️  DATABASE TYPE DETECTION');
    console.log('============================');
    
    try {
      // Try PostgreSQL specific query
      const pgVersion = await db.raw('SELECT version()');
      console.log('✅ Connected to PostgreSQL!');
      console.log('Version:', pgVersion.rows[0].version);
      
      // Get connection info
      const connInfo = await db.raw('SELECT current_database(), current_user, inet_server_addr(), inet_server_port()');
      console.log('Database:', connInfo.rows[0].current_database);
      console.log('User:', connInfo.rows[0].current_user);
      console.log('Server:', connInfo.rows[0].inet_server_addr);
      console.log('Port:', connInfo.rows[0].inet_server_port);
      
    } catch (pgError) {
      // Try SQLite specific query
      try {
        const sqliteVersion = await db.raw('SELECT sqlite_version()');
        console.log('⚠️  Connected to SQLite!');
        console.log('Version:', sqliteVersion[0]['sqlite_version()']);
        console.log('File:', config.connection.filename || 'In-memory');
      } catch (sqliteError) {
        console.log('❌ Unknown database type');
      }
    }
    
    // Check table structure to see if it matches our migrations
    console.log('\n📋 TABLE VERIFICATION');
    console.log('=====================');
    
    const users = await db('users').count('* as count').first();
    const photos = await db('photos').count('* as count').first();
    
    console.log(`Users: ${users.count} records`);
    console.log(`Photos: ${photos.count} records`);
    
    // Show a sample user to verify it's the migrated data
    const sampleUser = await db('users').select('id', 'username', 'email', 'role').first();
    if (sampleUser) {
      console.log('Sample user:', sampleUser);
    }
    
    // Check for Supabase-specific indicators
    try {
      const supabaseCheck = await db.raw("SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements' OR extname = 'uuid-ossp'");
      if (supabaseCheck.rows && supabaseCheck.rows.length > 0) {
        console.log('✅ Supabase-specific extensions detected!');
        supabaseCheck.rows.forEach(ext => {
          console.log(`  - ${ext.extname}`);
        });
      }
    } catch (err) {
      // Not PostgreSQL or extensions not found
    }
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  } finally {
    await db.destroy();
  }
}

testDatabaseConnection();