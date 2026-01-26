function loadEnv() {
  // Load server/.env first so everything else sees the right config.
  // This prevents modules from reading process.env before we're ready.
  require('../env');
}

module.exports = {
  loadEnv,
};

export {};
