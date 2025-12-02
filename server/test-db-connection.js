const knex = require('knex');
require('dotenv').config();

const config = {
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Testing with the setting from your knexfile
  },
};

const db = knex(config);

console.log('Attempting to connect to:', process.env.DATABASE_URL);
console.log('SSL Settings:', config.connection.ssl);

db.raw('SELECT 1')
  .then(() => {
    console.log('Connection successful!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Connection failed:', err.message);
    
    // Try again without SSL
    console.log('\nRetrying without SSL...');
    const noSslConfig = { ...config, connection: { ...config.connection, ssl: false } };
    const dbNoSsl = knex(noSslConfig);
    
    dbNoSsl.raw('SELECT 1')
      .then(() => {
        console.log('Connection successful WITHOUT SSL!');
        process.exit(0);
      })
      .catch((err2) => {
        console.error('Connection failed without SSL:', err2.message);
        process.exit(1);
      });
  });
