// Script to generate a JWT token for the first active user in the DB
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../db/index');
const { generateToken } = require('../middleware/auth');

async function run() {
  try {
    const user = await db('users').where({ is_active: true }).first();
    if (!user) {
      console.error('No active user found in users table');
      process.exit(2);
    }
    const token = generateToken({ id: user.id, username: user.username, email: user.email, role: user.role || 'user' });
    console.log(token);
    process.exit(0);
  } catch (err) {
    console.error('Failed to generate token:', err && err.message);
    process.exit(2);
  }
}

run();
