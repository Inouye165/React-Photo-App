import type { Request, Response } from 'express';

const express = require('express') as typeof import('express');

module.exports = function createHealthRouter() {
  const router = express.Router();

  let appVersion: string | undefined;
  try {
    appVersion = require('../version').APP_VERSION as string | undefined;
  } catch {
    appVersion = undefined;
  }

  // Health check endpoint (router-root). When mounted at '/health' the final
  // path becomes '/health'. The test-suite mounts the router at '/health',
  // so define the handler on '/'.
  router.get('/', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: appVersion || null,
      commit:
        process.env.RAILWAY_GIT_COMMIT_SHA ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.GIT_COMMIT_SHA ||
        null,
    });
  });

  return router;
};