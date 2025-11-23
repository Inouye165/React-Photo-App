require('./env');
const knexConfig = require('./knexfile');
const knex = require('knex')(knexConfig.development);

async function inspectUsers() {
  try {
    const columnInfo = await knex('users').columnInfo();
    console.log('Users table columns:', columnInfo);
    
    const user = await knex('users').where({ email: 'inouye165@gmail.com' }).first();
    console.log('User record:', user);
    
  } catch (error) {
    console.error(error);
  } finally {
    await knex.destroy();
  }
}

inspectUsers();
