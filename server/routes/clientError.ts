// @ts-nocheck

// Log client-side errors from the toast notification
const express = require('express');
const logger = require('../logger');
const router = express.Router();

router.post('/client-error', (req, res) => {
  const { message, userAgent } = req.body || {};
  if (message) {
    logger.error(`[CLIENT ERROR] ${message} (User-Agent: ${userAgent})`);
  }
  res.json({ success: true });
});

module.exports = router;
