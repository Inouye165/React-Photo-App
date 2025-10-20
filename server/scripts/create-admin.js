#!/usr/bin/env node

/**
 * Script to create the first admin user
 * Usage: node scripts/create-admin.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { openDb, migrate } = require('../db/index');
const { createUser, getUserByUsername, validatePassword } = require('../middleware/auth');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function hiddenQuestion(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    let input = '';
    const onData = (char) => {
      switch (char) {
        case '\u0003': // Ctrl+C
        case '\u0004': // Ctrl+D
          process.exit();
          break;
        case '\r':
        case '\n':
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(input);
          break;
        case '\u0008': // Backspace
        case '\u007f': // Delete
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          input += char;
          process.stdout.write('*');
          break;
      }
    };
    
    process.stdin.on('data', onData);
  });
}

async function createAdmin() {
  console.log('🔐 Creating first admin user for Photo App\n');

  try {
    const db = openDb();
    await migrate(db);

    // Check if any users exist
    const existingUsers = await new Promise((resolve, reject) => {
      db.all('SELECT COUNT(*) as count FROM users', (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0].count);
      });
    });

    if (existingUsers > 0) {
      console.log('⚠️  Users already exist in the database.');
      const proceed = await question('Do you want to create another admin user? (y/N): ');
      if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
        console.log('Exiting...');
        process.exit(0);
      }
    }

    // Get user input
    const username = await question('Enter admin username: ');
    if (!username || username.length < 3) {
      console.log('❌ Username must be at least 3 characters long');
      process.exit(1);
    }

    // Check if username already exists
    const existingUser = await getUserByUsername(db, username);
    if (existingUser) {
      console.log('❌ Username already exists');
      process.exit(1);
    }

    const email = await question('Enter admin email: ');
    if (!email || !email.includes('@')) {
      console.log('❌ Please provide a valid email address');
      process.exit(1);
    }

    console.log('\nPassword requirements:');
    console.log('• At least 8 characters long');
    console.log('• Contains uppercase and lowercase letters');
    console.log('• Contains at least one number');
    console.log('• Contains at least one special character\n');

    let password;
    let passwordValid = false;
    
    while (!passwordValid) {
      password = await hiddenQuestion('Enter admin password: ');
      const validation = validatePassword(password);
      
      if (validation.isValid) {
        passwordValid = true;
      } else {
        console.log('❌ Password does not meet requirements:');
        validation.errors.forEach(error => console.log(`   • ${error}`));
        console.log('');
      }
    }

    const confirmPassword = await hiddenQuestion('Confirm password: ');
    if (password !== confirmPassword) {
      console.log('❌ Passwords do not match');
      process.exit(1);
    }

    // Create the admin user
    console.log('\n🔨 Creating admin user...');
    
    const newUser = await createUser(db, {
      username,
      email,
      password,
      role: 'admin'
    });

    console.log('✅ Admin user created successfully!');
    console.log(`   Username: ${newUser.username}`);
    console.log(`   Email: ${newUser.email}`);
    console.log(`   Role: ${newUser.role}`);
    console.log('\n🚀 You can now start the server and log in with these credentials.');

  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    process.exit(0);
  }
}

// Check if we're running this script directly
if (require.main === module) {
  createAdmin();
}

module.exports = { createAdmin };