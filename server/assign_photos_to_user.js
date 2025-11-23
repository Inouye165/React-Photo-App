require('./env');
const knexConfig = require('./knexfile');
const knex = require('knex')(knexConfig.development);

const TARGET_EMAIL = 'inouye165@gmail.com';

async function assignPhotos() {
  try {
    console.log(`Looking for user with email: ${TARGET_EMAIL}...`);
    
    const user = await knex('users').where({ email: TARGET_EMAIL }).first();
    
    if (!user) {
      console.error(`User ${TARGET_EMAIL} not found!`);
      process.exit(1);
    }

    console.log(`Found user: ${user.email} (ID: ${user.id})`);

    // Count photos before update
    const totalPhotos = await knex('photos').count('* as count').first();
    console.log(`Total photos in database: ${totalPhotos.count}`);

    // Update all photos to belong to this user
    // We'll update all of them since the user said "attached to old users" and wants to access them.
    const updated = await knex('photos')
      .update({ user_id: user.id });

    console.log(`Successfully assigned ${updated} photos to ${TARGET_EMAIL}`);

  } catch (error) {
    console.error('Error assigning photos:', error);
  } finally {
    await knex.destroy();
  }
}

assignPhotos();
