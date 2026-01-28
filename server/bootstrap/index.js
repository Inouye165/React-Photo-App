const { loadEnv } = require('./loadEnv');
const { validateConfig } = require('./validateConfig');
const { registerProcessHandlers } = require('./registerProcessHandlers');
const { createDependencies } = require('./createDependencies');
const { createApp } = require('./createApp.ts');
const { startIntegrations } = require('./startIntegrations');
const { createShutdownManager, installSignalHandlers } = require('./shutdown');

module.exports = {
  loadEnv,
  validateConfig,
  registerProcessHandlers,
  createDependencies,
  createApp,
  startIntegrations,
  createShutdownManager,
  installSignalHandlers,
};
