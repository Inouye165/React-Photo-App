exports.up = function(knex) {
  return knex.schema.table('photos', function(table) {
    // Store a JSON array (string) of past AI runs: [{ timestamp, runType, modelsUsed, classification, caption, keywords }]
    table.text('ai_model_history');
  });
};

exports.down = function(knex) {
  return knex.schema.table('photos', function(table) {
    table.dropColumn('ai_model_history');
  });
};
