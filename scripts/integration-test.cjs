const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const SERVER_CMD = 'node';
const SERVER_ARGS = ['server/server.js'];
const HEALTH_URL = { hostname: 'localhost', port: 3001, path: '/health', method: 'GET' };
const PRIV_URL = { hostname: 'localhost', port: 3001, path: '/privilege', method: 'POST', headers: { 'Content-Type': 'application/json' } };

// Pull working dir from server config so we can create a test file there
const paths = require('../server/config/paths');
const TEST_FILE_BASE = `test-integration-${Date.now()}.txt`;
const TEST_FILE_PATH = path.join(paths.WORKING_DIR, TEST_FILE_BASE);

function waitForHealth(timeout = 10000, interval = 200) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function poll() {
      const req = http.request(HEALTH_URL, (res) => {
        if (res.statusCode === 200) return resolve();
        if (Date.now() - start > timeout) return reject(new Error('Health timeout'));
        setTimeout(poll, interval);
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error('Health timeout'));
        setTimeout(poll, interval);
      });
      req.end();
    })();
  });
}

function postPrivilege(relPath) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ relPath });
    const opts = Object.assign({}, PRIV_URL);
    opts.headers = Object.assign({}, PRIV_URL.headers, { 'Content-Length': Buffer.byteLength(payload) });
    const req = http.request(opts, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async function run() {
  console.log('Starting server...');
  const srv = spawn(SERVER_CMD, SERVER_ARGS, { stdio: ['ignore', 'pipe', 'pipe'] });

  srv.stdout.on('data', (d) => process.stdout.write(`[server stdout] ${d}`));
  srv.stderr.on('data', (d) => process.stderr.write(`[server stderr] ${d}`));

  srv.on('exit', (code, sig) => {
    console.log('Server process exited', code, sig);
  });

  try {
    // Create a small dummy file in WORKING_DIR so privilege check has a real target
    fs.writeFileSync(TEST_FILE_PATH, 'integration-test');
    console.log('Created test file:', TEST_FILE_PATH);
    await waitForHealth(12000, 200);
    console.log('Server healthy. Running privilege check...');
    const res = await postPrivilege(TEST_FILE_BASE);
    console.log('Privilege check status:', res.status);
    console.log('Privilege response body:', res.body);
    if (res.status === 200 && res.body && res.body.success) {
      console.log('Integration test passed');
      try { fs.unlinkSync(TEST_FILE_PATH); console.log('Removed test file'); } catch (e) {}
      srv.kill();
      process.exit(0);
    } else {
      console.error('Integration test failed: unexpected response');
      try { fs.unlinkSync(TEST_FILE_PATH); } catch (e) {}
      srv.kill();
      process.exit(1);
    }
  } catch (err) {
    console.error('Integration test error:', err && err.message ? err.message : err);
    try { fs.unlinkSync(TEST_FILE_PATH); } catch (e) {}
    try { srv.kill(); } catch (e) {}
    process.exit(1);
  }
})();
