// Data migration script: SQLite to PostgreSQL (Supabase)
const knex = require('knex');
const path = require('path');
require('dotenv').config();

// SQLite configuration (source)
const sqliteConfig = {
  client: 'sqlite3',
  connection: {
    filename: path.join(__dirname, 'photos.db')
  },
  useNullAsDefault: true
};

// PostgreSQL configuration (destination)
const postgresConfig = {
  client: 'pg',
  connection: {
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  }
};

async function migrateData() {
  const sqliteDb = knex(sqliteConfig);
  const postgresDb = knex(postgresConfig);
  
  try {
    console.log('🚀 Starting data migration from SQLite to PostgreSQL...\n');
    
    // 1. Test PostgreSQL connection
    console.log('1️⃣ Testing PostgreSQL connection...');
    await postgresDb.raw('SELECT 1');
    console.log('✅ PostgreSQL connection successful\n');
    
    // 2. Migrate Users
    console.log('2️⃣ Migrating users...');
    const users = await sqliteDb('users').select('*');
    console.log(`Found ${users.length} users to migrate`);
    
    for (const user of users) {
      try {
        // Check if user already exists
        const existingUser = await postgresDb('users')
          .where('email', user.email)
          .orWhere('username', user.username)
          .first();
        
        if (existingUser) {
          console.log(`⚠️  User ${user.username} already exists, skipping...`);
          continue;
        }
        
        // Insert user (excluding id to let PostgreSQL auto-increment)
        const [insertedUser] = await postgresDb('users').insert({
          username: user.username,
          email: user.email,
          password_hash: user.password_hash,
          role: user.role,
          is_active: user.is_active,
          failed_login_attempts: user.failed_login_attempts,
          last_login_attempt: user.last_login_attempt,
          account_locked_until: user.account_locked_until,
          created_at: user.created_at,
          updated_at: user.updated_at
        }).returning('*');
        
        console.log(`✅ Migrated user: ${user.username} (new ID: ${insertedUser.id})`);
      } catch (error) {
        console.error(`❌ Error migrating user ${user.username}:`, error.message);
      }
    }
    
    // 3. Migrate Photos
    console.log('\n3️⃣ Migrating photos...');
    const photos = await sqliteDb('photos').select('*');
    console.log(`Found ${photos.length} photos to migrate`);
    
    for (const photo of photos) {
      try {
        // Check if photo already exists
        const existingPhoto = await postgresDb('photos')
          .where('hash', photo.hash)
          .first();
        
        if (existingPhoto) {
          console.log(`⚠️  Photo ${photo.filename} already exists, skipping...`);
          continue;
        }
        
        // Insert photo (excluding id to let PostgreSQL auto-increment)
        const [insertedPhoto] = await postgresDb('photos').insert({
          filename: photo.filename,
          state: photo.state,
          metadata: photo.metadata,
          hash: photo.hash,
          created_at: photo.created_at,
          updated_at: photo.updated_at,
          // Add any AI fields if they exist
          ...(photo.caption && { caption: photo.caption }),
          ...(photo.description && { description: photo.description }),
          ...(photo.keywords && { keywords: photo.keywords }),
          ...(photo.poi_data && { poi_data: photo.poi_data }),
          ...(photo.file_size && { file_size: photo.file_size })
        }).returning('*');
        
        console.log(`✅ Migrated photo: ${photo.filename} (new ID: ${insertedPhoto.id})`);
      } catch (error) {
        console.error(`❌ Error migrating photo ${photo.filename}:`, error.message);
      }
    }
    
    // 4. Verify migration
    console.log('\n4️⃣ Verifying migration...');
    const migratedUsers = await postgresDb('users').count('* as count').first();
    const migratedPhotos = await postgresDb('photos').count('* as count').first();
    
    console.log(`✅ Verification complete:`);
    console.log(`   - Users in PostgreSQL: ${migratedUsers.count}`);
    console.log(`   - Photos in PostgreSQL: ${migratedPhotos.count}`);
    console.log(`   - Original users: ${users.length}`);
    console.log(`   - Original photos: ${photos.length}`);
    
    console.log('\n🎉 Data migration completed successfully!');
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    throw error;
  } finally {
    await sqliteDb.destroy();
    await postgresDb.destroy();
  }
}

// Run migration
if (require.main === module) {
  migrateData()
    .then(() => {
      console.log('\n✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateData };