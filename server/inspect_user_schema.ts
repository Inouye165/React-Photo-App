import './env';
import knexFactory, { type Knex } from 'knex';

const knexConfig = require('./knexfile') as Record<string, Knex.Config>;
const knex = knexFactory(knexConfig.development);

type UserRow = {
  email: string;
};

async function inspectUsers(): Promise<void> {
  try {
    const columnInfo = await knex<UserRow>('users').columnInfo();
    console.log('Users table columns:', columnInfo);

    const user = await knex<UserRow>('users').where({ email: 'inouye165@gmail.com' }).first();
    console.log('User record:', user);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await knex.destroy();
  }
}

void inspectUsers();