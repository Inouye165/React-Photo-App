// @ts-nocheck

const { loadEnv } = require('./loadEnv');
const { validateConfig } = require('./validateConfig');
const { registerProcessHandlers } = require('./registerProcessHandlers');
const { createDependencies } = require('./createDependencies');
const { createApp } = require('./createApp');
const { startIntegrations } = require('./startIntegrations');
const { createShutdownManager, installSignalHandlers } = require('./shutdown');

export = {
  loadEnv,
  validateConfig,
  registerProcessHandlers,
  createDependencies,
  createApp,
  startIntegrations,
  createShutdownManager,
  installSignalHandlers,
};
