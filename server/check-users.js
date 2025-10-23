const knex = require('knex');
require('dotenv').config();

const db = knex({
  client: 'pg',
  connection: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkUsers() {
  try {
    console.log('👥 Checking users in database...');
    
    const users = await db('users').select('id', 'username', 'email', 'role');
    
    if (users.length === 0) {
      console.log('❌ No users found - you need to create a user account');
    } else {
      console.log('✅ Users found:');
      users.forEach(user => {
        console.log(`   ID ${user.id}: ${user.username} (${user.email}) - Role: ${user.role}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking users:', error.message);
  } finally {
    await db.destroy();
  }
}

checkUsers();