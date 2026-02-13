const { spawn } = require('node:child_process');

function prefixStream(stream, prefix) {
  stream.on('data', (chunk) => {
    const lines = String(chunk).split(/\r?\n/);
    for (const line of lines) {
      if (!line) continue;
      process.stdout.write(`${prefix} ${line}\n`);
    }
  });
}

function runCommand(command, args, { label, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: process.platform === 'win32',
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.env,
    });

    const prefix = label ? `[${label}]` : `[${command}]`;
    prefixStream(child.stdout, prefix);
    prefixStream(child.stderr, `${prefix}[err]`);

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || allowFailure) {
        resolve(code ?? 0);
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

function startService(command, args, label, children) {
  const child = spawn(command, args, {
    shell: process.platform === 'win32',
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  });

  prefixStream(child.stdout, `[${label}]`);
  prefixStream(child.stderr, `[${label}][err]`);

  child.on('close', (code) => {
    const detail = typeof code === 'number' ? `exit ${code}` : 'closed';
    process.stderr.write(`[${label}] stopped (${detail})\n`);
  });

  children.push(child);
  return child;
}

async function ensureSupabaseAndMigrations() {
  await runCommand('supabase', ['start'], { label: 'supabase' });

  const checkCode = await runCommand('npm', ['run', 'check:supabase:migrations'], {
    label: 'migrations',
    allowFailure: true,
  });

  if (checkCode !== 0) {
    process.stdout.write('[migrations] Applying pending local migrations...\n');
    await runCommand('supabase', ['db', 'push', '--local', '--yes'], { label: 'migrations' });
    await runCommand('npm', ['run', 'check:supabase:migrations'], { label: 'migrations' });
  }
}

async function main() {
  const children = [];
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`\n[local-start] Received ${signal}. Stopping child processes...\n`);
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGINT');
      }
    }
    setTimeout(() => process.exit(0), 800).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    process.stdout.write('[local-start] Ensuring Supabase is running and migrations are current...\n');
    await ensureSupabaseAndMigrations();

    process.stdout.write('[local-start] Starting backend, worker, and frontend...\n');
    startService('npm', ['--prefix', 'server', 'start'], 'api', children);
    startService('npm', ['run', 'worker'], 'worker', children);
    startService('npm', ['run', 'dev'], 'web', children);

    process.stdout.write('[local-start] Ready. API: http://127.0.0.1:3001/health | Web: see [web] Local URL in logs\n');
  } catch (error) {
    process.stderr.write(`[local-start][err] ${error.message}\n`);
    for (const child of children) {
      if (!child.killed) child.kill('SIGINT');
    }
    process.exit(1);
  }
}

main();
