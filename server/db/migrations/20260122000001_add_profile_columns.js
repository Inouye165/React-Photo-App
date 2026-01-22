/**
 * Migration: Add profile columns to users table (username, avatar)
 * 
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
  const hasUsername = await knex.schema.hasColumn('users', 'username');
  const hasSetUsername = await knex.schema.hasColumn('users', 'has_set_username');
  const hasAvatarUrl = await knex.schema.hasColumn('users', 'avatar_url');
  const hasAvatarUpdatedAt = await knex.schema.hasColumn('users', 'avatar_updated_at');

  if (!hasUsername || !hasSetUsername || !hasAvatarUrl || !hasAvatarUpdatedAt) {
    await knex.schema.table('users', (table) => {
      if (!hasUsername) {
        table.string('username').nullable().unique();
      }
      if (!hasSetUsername) {
        table.boolean('has_set_username').notNullable().defaultTo(false);
      }
      if (!hasAvatarUrl) {
        table.text('avatar_url').nullable();
      }
      if (!hasAvatarUpdatedAt) {
        table.timestamp('avatar_updated_at').nullable();
      }
    });
  }

  if (knex.client.config.client === 'pg') {
    const comments = [];
    if (!hasUsername) {
      comments.push("COMMENT ON COLUMN users.username IS 'Public display username.';");
    }
    if (!hasSetUsername) {
      comments.push("COMMENT ON COLUMN users.has_set_username IS 'Whether the user has completed username onboarding.';");
    }
    if (!hasAvatarUrl) {
      comments.push("COMMENT ON COLUMN users.avatar_url IS 'Public URL for avatar image.';");
    }
    if (!hasAvatarUpdatedAt) {
      comments.push("COMMENT ON COLUMN users.avatar_updated_at IS 'Timestamp when avatar was last updated.';");
    }
    if (comments.length) {
      await knex.raw(comments.join('\n'));
    }
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
  const hasUsername = await knex.schema.hasColumn('users', 'username');
  const hasSetUsername = await knex.schema.hasColumn('users', 'has_set_username');
  const hasAvatarUrl = await knex.schema.hasColumn('users', 'avatar_url');
  const hasAvatarUpdatedAt = await knex.schema.hasColumn('users', 'avatar_updated_at');

  if (hasAvatarUpdatedAt || hasAvatarUrl || hasSetUsername || hasUsername) {
    await knex.schema.table('users', (table) => {
      if (hasAvatarUpdatedAt) table.dropColumn('avatar_updated_at');
      if (hasAvatarUrl) table.dropColumn('avatar_url');
      if (hasSetUsername) table.dropColumn('has_set_username');
      if (hasUsername) table.dropColumn('username');
    });
  }
};
