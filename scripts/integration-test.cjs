const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

// --- MOCK SUPABASE AUTH SERVER ---
const http = require('http');
let mockServer;

async function startMockSupabaseServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url.startsWith('/auth/v1/user')) {
        if (!req.headers['authorization']) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing Authorization header' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'test-user-id',
          email: 'test@example.com',
          role: 'authenticated'
        }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, () => {
      const port = server.address().port;
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}

const SERVER_CMD = 'node';
const SERVER_ARGS = ['server/server.js'];
const HEALTH_URL = { hostname: 'localhost', port: 3001, path: '/health', method: 'GET' };
const INTEGRATION_ORIGIN = 'http://localhost:5173';
// CSRF token endpoint (csurf): GET /csrf -> { csrfToken } and sets csrfSecret cookie.
const CSRF_URL = { hostname: 'localhost', port: 3001, path: '/csrf', method: 'GET', headers: { 'Origin': INTEGRATION_ORIGIN } };
const PRIV_URL = { hostname: 'localhost', port: 3001, path: '/privilege', method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': INTEGRATION_ORIGIN } };

// Test user credentials for integration testing
const TEST_USER = {
  username: `test_${Date.now()}`,
  email: `test${Date.now()}@example.com`,
  password: 'IntegrationTest123!'
};

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

function makeRequest(url, payload = null) {
  return new Promise((resolve, reject) => {
    const opts = Object.assign({}, url);
    if (payload) {
      const payloadStr = JSON.stringify(payload);
      opts.headers = Object.assign({}, url.headers, { 'Content-Length': Buffer.byteLength(payloadStr) });
    }
    
    const req = http.request(opts, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        } catch (e) { 
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });
    
    req.on('error', reject);
    if (payload) {
      req.write(JSON.stringify(payload));
    }
    req.end();
  });
}

async function getCsrfToken() {
  console.log('Fetching CSRF token...');
  const result = await makeRequest(CSRF_URL);
  
  if (result.status === 404) {
      console.log('CSRF endpoint not found (404). Assuming CSRF not required or handled by Supabase.');
      return { csrfToken: null, csrfCookie: null };
  }

  if (result.status !== 200) {
    console.warn(`Failed to get CSRF token: ${result.status}. Proceeding without it.`);
    return { csrfToken: null, csrfCookie: null };
  }
  
  const csrfToken = result.body.csrfToken;
  let csrfCookie = null;
  if (result.headers && result.headers['set-cookie']) {
    const sc = result.headers['set-cookie'];
    const setCookie = Array.isArray(sc) ? sc : [sc];
    // csurf cookie mode sets a secret cookie; our server config uses key 'csrfSecret'.
    const found = setCookie.find((c) => typeof c === 'string' && c.startsWith('csrfSecret='));
    if (found) csrfCookie = found.split(';')[0];
  }
  
  return { csrfToken, csrfCookie };
}

async function registerAndLogin() {
  // Always return the dummy token expected by the mock server.
  // But DO fetch CSRF token/cookie for unsafe requests now that csurf is enabled.
  const { csrfToken, csrfCookie } = await getCsrfToken();
  return { authToken: 'integration-test-token', csrfToken, csrfCookie };
}

function postPrivilege({ authToken, csrfToken, csrfCookie }) {
  const payload = { relPath: 'test-file.jpg' };
  const opts = Object.assign({}, PRIV_URL);
  const headersBase = Object.assign({}, PRIV_URL.headers, { 'Content-Length': Buffer.byteLength(JSON.stringify(payload)) });
  
  if (csrfToken) headersBase['X-CSRF-Token'] = csrfToken;
  
  const cookies = [];
  if (typeof authToken === 'string' && authToken.startsWith('authToken=')) {
    cookies.push(authToken);
  }
  if (csrfCookie) {
    cookies.push(csrfCookie);
  }
  
  if (cookies.length > 0) {
    opts.headers = Object.assign({}, headersBase, { 'Cookie': cookies.join('; ') });
  } else {
    opts.headers = headersBase;
  }
  
  if (typeof authToken === 'string' && !authToken.startsWith('authToken=')) {
    opts.headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  return makeRequest(opts, payload);
}

(async function run() {
  // Set DATABASE_URL to use PostgreSQL (defaults to localhost:5432 for CI)
  if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    console.log('[integration-test] Using default DATABASE_URL:', process.env.DATABASE_URL);
  }

  // Start the mock Supabase Auth server
  const { server: mockSrv, port: mockPort } = await startMockSupabaseServer();
  mockServer = mockSrv;
  process.env.SUPABASE_URL = `http://localhost:${mockPort}`;
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';

  console.log('Started mock Supabase Auth server on port', mockPort);
  console.log('Starting server with PostgreSQL...');
  
  const srv = spawn(SERVER_CMD, SERVER_ARGS, { stdio: ['ignore', 'pipe', 'pipe'] });

  srv.stdout.on('data', (d) => process.stdout.write(`[server stdout] ${d}`));
  srv.stderr.on('data', (d) => process.stderr.write(`[server stderr] ${d}`));

  srv.on('exit', (code, sig) => {
    console.log('Server process exited', code, sig);
  });

  try {
    await waitForHealth(12000, 200);
    console.log('Server healthy. Authenticating...');

    const authData = await registerAndLogin();
    
    console.log('Running authenticated privilege check...');
    const res = await postPrivilege(authData);
    console.log('Privilege check status:', res.status);
    console.log('Privilege response body:', res.body);

    if (res.status === 200 && res.body && res.body.success) {
      console.log('Integration test passed - authentication and privilege check working');
      srv.kill();
      mockServer.close();
      process.exit(0);
    } else {
      console.error('Integration test failed: unexpected privilege response');
      srv.kill();
      mockServer.close();
      process.exit(1);
    }
  } catch (err) {
    console.error('Integration test error:', err && err.message ? err.message : err);
    try { srv.kill(); } catch (e) {}
    try { mockServer.close(); } catch (e) {}
    process.exit(1);
  }
})();
