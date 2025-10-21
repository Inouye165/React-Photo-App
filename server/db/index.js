// server/db/index.js
const knex = require('knex');
const knexConfig = require('../knexfile');

// Determine the environment, defaulting to 'development'
const environment = process.env.NODE_ENV || 'development';

// Initialize knex with the correct configuration
const db = knex(knexConfig[environment]);

module.exports = db;