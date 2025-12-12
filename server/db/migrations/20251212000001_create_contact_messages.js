/**
 * Migration: Create contact_messages table
 * 
 * This table stores public contact form submissions.
 * All fields are validated at the API layer before insertion.
 */

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function(knex) {
  // Ensure uuid-ossp extension is available for UUID generation
  // This is safe to run multiple times (CREATE EXTENSION IF NOT EXISTS)
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  await knex.schema.createTable('contact_messages', (table) => {
    // Primary key: UUID for security (non-enumerable IDs)
    table.uuid('id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'));

    // Contact form fields with strict length limits
    table.string('name', 100).notNullable();
    table.string('email', 255).notNullable();
    table.string('subject', 150).defaultTo('General Inquiry');
    table.text('message').notNullable();

    // Message lifecycle tracking
    table.string('status', 50).defaultTo('new');

    // Metadata for rate limiting and abuse prevention
    table.string('ip_address', 45); // IPv6 max length is 45 chars

    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes for common queries
    table.index('status');
    table.index('created_at');
    table.index('email');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('contact_messages');
  // Note: We don't drop the uuid-ossp extension as other tables may use it
};
