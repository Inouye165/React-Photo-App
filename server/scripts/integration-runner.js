#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');

const SERVER_DIR = path.join(__dirname, '..');
const SERVER_ENTRY = path.join(SERVER_DIR, 'server.js');
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

function waitForOutput(child, matcher, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let seen = false;
    const onData = (chunk) => {
      const s = String(chunk);
      process.stdout.write(`[server] ${s}`);
      if (matcher.test(s)) {
        seen = true;
        cleanup();
        resolve();
      }
    };

    const onErr = (chunk) => {
      const s = String(chunk);
      process.stderr.write(`[server.err] ${s}`);
      if (matcher.test(s)) {
        seen = true;
        cleanup();
        resolve();
      }
    };

    const onExit = (code, sig) => {
      if (!seen) {
        cleanup();
        reject(new Error(`Server exited early with code=${code} sig=${sig}`));
      }
    };

    const cleanup = () => {
      child.stdout.removeListener('data', onData);
      child.stderr.removeListener('data', onErr);
      child.removeListener('exit', onExit);
      clearTimeout(timer);
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onErr);
    child.on('exit', onExit);

    const timer = setTimeout(() => {
      if (!seen) {
        cleanup();
        reject(new Error('Timeout waiting for server ready output'));
      }
    }, timeout);
  });
}

async function main() {
  console.log('[integration-runner] Spawning server in test mode...');

  const env = Object.assign({}, process.env, {
    NODE_ENV: 'test',
    JWT_SECRET,
    PORT: String(PORT),
    // Allow debug endpoints in this local integration run
    ALLOW_DEV_DEBUG: 'true'
  });

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: SERVER_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.on('error', (err) => console.error('[integration-runner] Server process error:', err));
  child.on('exit', (code, sig) => console.log('[integration-runner] Server process exited', code, sig));

  try {
    // Wait for server to announce it's running (or the test seed message)
    await waitForOutput(child, /Photo upload server running on port|\[TEST SEED\]/i, 15000);
  } catch (err) {
    console.error('[integration-runner] Server failed to start in time:', err.message);
    child.kill();
    process.exit(1);
  }

  // Build a JWT token matching the test user shape
  const token = jwt.sign({ id: 1, username: 'testuser', email: 'test@example.com', role: 'user' }, JWT_SECRET, { expiresIn: '1h' });

  const payload = JSON.stringify({ state: 'inprogress' });

  const options = {
    hostname: 'localhost',
    port: PORT,
    path: '/photos/1/state',
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization': `Bearer ${token}`
    }
  };

  console.log('[integration-runner] Sending PATCH /photos/1/state');

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      console.log('[integration-runner] Response status:', res.statusCode);
  try { console.log('[integration-runner] Response body:', JSON.parse(body)); } catch { console.log('[integration-runner] Response body (raw):', body); }

      // Give server a moment to flush logs, then shut it down
      setTimeout(() => {
        console.log('[integration-runner] Shutting down server process...');
        child.kill('SIGINT');
      }, 500);
    });
  });

  req.on('error', (err) => {
    console.error('[integration-runner] Request error:', err);
    child.kill();
  });

  req.write(payload);
  req.end();
}

main().catch(err => {
  console.error('[integration-runner] Fatal error:', err);
  process.exit(1);
});
