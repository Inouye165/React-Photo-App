function createDependencies() {
  const logger = require('../logger');
  const db = require('../db/index');
  const supabase = require('../lib/supabaseClient');

  return {
    logger,
    db,
    supabase,
  };
}

module.exports = {
  createDependencies,
};
