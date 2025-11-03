// Simple script to create an admin user
require('./env');

const db = require('./db/index');
const bcrypt = require('bcryptjs');
const logger = require('./logger');

async function createAdminUser() {
  try {
  logger.info('Creating admin user...');
    
    // Check if admin user already exists
    const existingUser = await db('users').where('username', 'admin').first();
    if (existingUser) {
      logger.info('Admin user already exists!');
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
    
    logger.info('Admin user created successfully!');
    logger.info('Username: admin');
    logger.info('Password: admin123');
    logger.info('Email: admin@test.com');
    
  } catch (error) {
    logger.error('Error creating admin user:', error);
  } finally {
    await db.destroy();
  }
}

createAdminUser();