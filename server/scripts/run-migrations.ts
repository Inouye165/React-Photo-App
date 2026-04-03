#!/usr/bin/env node
/**
 * server/scripts/run-migrations.ts
 *
 * Runs Knex migrations programmatically using the same knexfile configuration
 * the server uses. This is used by `npm start` via `prestart` so Railway can
 * keep the DB schema in sync without requiring an interactive shell.
 */

import fs from 'fs';
import path from 'path';
import knexFactory, { type Knex } from 'knex';

import '../env';

type KnexEnvironment = 'development' | 'test' | 'production';
type KnexConfigMap = Record<string, Knex.Config>;

function resolveKnexEnv(): KnexEnvironment {
  const nodeEnv = (process.env.NODE_ENV || 'development').trim();
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'test') return 'test';
  return 'development';
}

async function runMigrations(): Promise<void> {
  if (process.env.SKIP_RUN_MIGRATIONS === 'true') {
    console.log('[migrations] SKIP_RUN_MIGRATIONS=true -> skipping migrations');
    return;
  }

  const knexfile = loadKnexfile();
  const env = resolveKnexEnv();
  const cfg = knexfile[env];
  if (!cfg) {
    throw new Error(`[migrations] knex config for environment "${env}" not found`);
  }

  const db = knexFactory(cfg);
  try {
    const result = await db.migrate.latest();
    const batch = result?.[0];
    const files = result?.[1];

    if (Array.isArray(files) && files.length > 0) {
      console.log(`[migrations] Applied batch ${batch}: ${files.join(', ')}`);
    } else {
      console.log('[migrations] No pending migrations');
    }
  } finally {
    await db.destroy();
  }
}

function loadKnexfile(): KnexConfigMap {
  const rootDir = path.resolve(__dirname, '..');
  const candidateJsPaths = [path.join(rootDir, 'knexfile.js'), path.join(rootDir, 'dist', 'knexfile.js')];

  for (const jsPath of candidateJsPaths) {
    if (fs.existsSync(jsPath)) {
      return require(jsPath) as KnexConfigMap;
    }
  }

  const tsPath = path.join(rootDir, 'knexfile.ts');
  if (fs.existsSync(tsPath)) {
    try {
      require('tsx/cjs');
      return require(tsPath) as KnexConfigMap;
    } catch {
      throw new Error(
        '[migrations] knexfile.ts detected but could not be loaded. Run npm --prefix server run build or ensure tsx is installed.'
      );
    }
  }

  throw new Error('[migrations] knex config not found. Expected server/knexfile.js, server/dist/knexfile.js, or server/knexfile.ts');
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[migrations] FAILED:', message);
      process.exit(1);
    });
}

export { runMigrations };