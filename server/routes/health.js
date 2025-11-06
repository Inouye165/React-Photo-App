const express = require('express');

module.exports = function createHealthRouter() {
  const router = express.Router();

  // Health check endpoint (router-root). When mounted at '/health' the final
  // path becomes '/health'. The test-suite mounts the router at '/health',
  // so define the handler on '/'.
  router.get('/', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return router;
};