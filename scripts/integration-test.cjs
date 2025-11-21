const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const SERVER_CMD = 'node';
const SERVER_ARGS = ['server/server.js'];
const HEALTH_URL = { hostname: 'localhost', port: 3001, path: '/health', method: 'GET' };
// Add an explicit Origin header so that the server's strict-origin CSRF
// protection sees a known allowed origin and doesn't reject test requests.
const INTEGRATION_ORIGIN = 'http://localhost:5173';
const REGISTER_URL = { hostname: 'localhost', port: 3001, path: '/auth/register', method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': INTEGRATION_ORIGIN } };
const LOGIN_URL = { hostname: 'localhost', port: 3001, path: '/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': INTEGRATION_ORIGIN } };
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
          // Include response headers so callers can read Set-Cookie
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

async function registerAndLogin() {
  console.log('Registering test user...');
  
  // Try to register (may fail if user already exists, that's OK)
  try {
    const registerResult = await makeRequest(REGISTER_URL, TEST_USER);
    console.log('Register status:', registerResult.status);
    if (registerResult.status === 400 && registerResult.body.error) {
      console.log('Register error (this may be OK if user exists):', registerResult.body.error);
    }
  } catch (registerError) {
    console.log('Register attempt failed (proceeding to login):', registerError.message);
  }
  
  // Wait a bit to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Login to get auth token
  console.log('Logging in...');
  const loginResult = await makeRequest(LOGIN_URL, {
    username: TEST_USER.username,
    password: TEST_USER.password
  });
  
  console.log('Login result status:', loginResult.status);
  console.log('Login result body:', loginResult.body);
  console.log('Login response headers:', loginResult.headers && Object.keys(loginResult.headers));
  
  // Extract auth cookie from Set-Cookie header if present
  let authCookie = null;
  if (loginResult.headers && loginResult.headers['set-cookie']) {
    // set-cookie is an array like ['authToken=...; Path=/; HttpOnly', ...]
    const sc = loginResult.headers['set-cookie'];
    const found = sc.find(c => c && c.startsWith('authToken='));
    if (found) authCookie = found.split(';')[0]; // keep only 'authToken=...'
  }

  if (loginResult.status !== 200 || (!authCookie && !loginResult.body.token)) {
    // If login failed, try creating a user with different credentials
    console.log('Initial login failed, trying to register with unique credentials...');
    const uniqueUser = {
      username: `test_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password: 'IntegrationTest123!'
    };
    
    const registerResult2 = await makeRequest(REGISTER_URL, uniqueUser);
    console.log('Second register attempt:', registerResult2.status, registerResult2.body);
    
    if (registerResult2.status === 201) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const loginResult2 = await makeRequest(LOGIN_URL, {
        username: uniqueUser.username,
        password: uniqueUser.password
      });
      
      if (loginResult2.status === 200) {
        // try to extract cookie from this response as well
        let authCookie2 = null;
        if (loginResult2.headers && loginResult2.headers['set-cookie']) {
          const sc2 = loginResult2.headers['set-cookie'];
          const found2 = sc2.find(c => c && c.startsWith('authToken='));
          if (found2) authCookie2 = found2.split(';')[0];
        }
        if (authCookie2) {
          console.log('Login successful with new user (cookie)');
          return authCookie2; // return cookie string for subsequent requests
        }
        if (loginResult2.body && loginResult2.body.token) {
          console.log('Login successful with new user (token in body)');
          return loginResult2.body.token;
        }
      }
    }
    
    throw new Error(`Login failed: ${loginResult.status} - ${JSON.stringify(loginResult.body)}`);
  }
  
  console.log('Login successful');
  // Prefer returning the cookie string (e.g. 'authToken=...') so callers can set Cookie header.
  return authCookie || (loginResult.body && loginResult.body.token);
}

function postPrivilege(authToken) {
  const payload = { relPath: 'test-file.jpg' }; // Dummy path since Supabase Storage is used
  const opts = Object.assign({}, PRIV_URL);
  // If authToken looks like a cookie string (authToken=...), send it as Cookie header.
  const headersBase = Object.assign({}, PRIV_URL.headers, { 'Content-Length': Buffer.byteLength(JSON.stringify(payload)) });
  if (typeof authToken === 'string' && authToken.startsWith('authToken=')) {
    opts.headers = Object.assign({}, headersBase, { 'Cookie': authToken });
  } else {
    // Fallback for non-browser clients that still use bearer tokens
    opts.headers = Object.assign({}, headersBase, { 'Authorization': `Bearer ${authToken}` });
  }
  
  return makeRequest(opts, payload);
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
    await waitForHealth(12000, 200);
    console.log('Server healthy. Authenticating...');
    
    // Register and login to get auth token
    const authToken = await registerAndLogin();
    
    console.log('Running authenticated privilege check...');
    const res = await postPrivilege(authToken);
    console.log('Privilege check status:', res.status);
    console.log('Privilege response body:', res.body);
    
    if (res.status === 200 && res.body && res.body.success) {
      console.log('Integration test passed - authentication and privilege check working');
      srv.kill();
      process.exit(0);
    } else {
      console.error('Integration test failed: unexpected privilege response');
      srv.kill();
      process.exit(1);
    }
  } catch (err) {
    console.error('Integration test error:', err && err.message ? err.message : err);
    try { srv.kill(); } catch (e) {}
    process.exit(1);
  }
})();
