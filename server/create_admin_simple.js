// Simple script to create an admin user
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = require('./db/index');
const bcrypt = require('bcryptjs');

async function createAdminUser() {
  try {
    console.log('Creating admin user...');
    
    // Check if admin user already exists
    const existingUser = await db('users').where('username', 'admin').first();
    if (existingUser) {
      console.log('Admin user already exists!');
      return;
    }
    
    // Hash the password
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    // Create the user
    await db('users').insert({
      username: 'admin',
      email: 'admin@test.com',
      password_hash: hashedPassword,
      role: 'admin',
      is_active: true,
      failed_login_attempts: 0
    });
    
    console.log('Admin user created successfully!');
    console.log('Username: admin');
    console.log('Password: admin123');
    console.log('Email: admin@test.com');
    
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await db.destroy();
  }
}

createAdminUser();