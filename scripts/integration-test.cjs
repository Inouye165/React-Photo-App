const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const SERVER_CMD = 'node';
const SERVER_ARGS = ['server/server.js'];
const HEALTH_URL = { hostname: 'localhost', port: 3001, path: '/health', method: 'GET' };
const REGISTER_URL = { hostname: 'localhost', port: 3001, path: '/auth/register', method: 'POST', headers: { 'Content-Type': 'application/json' } };
const LOGIN_URL = { hostname: 'localhost', port: 3001, path: '/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } };
const PRIV_URL = { hostname: 'localhost', port: 3001, path: '/privilege', method: 'POST', headers: { 'Content-Type': 'application/json' } };

// Test user credentials for integration testing
const TEST_USER = {
  username: `test${Date.now()}`,
  email: `test${Date.now()}@example.com`,
  password: 'IntegrationTest123!'
};

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
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) { 
          resolve({ status: res.statusCode, body: data });
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
  
  if (loginResult.status !== 200 || !loginResult.body.token) {
    // If login failed, try creating a user with different credentials
    console.log('Initial login failed, trying to register with unique credentials...');
    const uniqueUser = {
      username: `test-${Date.now()}`,
      email: `test-${Date.now()}@example.com`,
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
      
      if (loginResult2.status === 200 && loginResult2.body.token) {
        console.log('Login successful with new user');
        return loginResult2.body.token;
      }
    }
    
    throw new Error(`Login failed: ${loginResult.status} - ${JSON.stringify(loginResult.body)}`);
  }
  
  console.log('Login successful, got auth token');
  return loginResult.body.token;
}

function postPrivilege(relPath, authToken) {
  const payload = { relPath };
  const opts = Object.assign({}, PRIV_URL);
  opts.headers = Object.assign({}, PRIV_URL.headers, { 
    'Content-Length': Buffer.byteLength(JSON.stringify(payload)),
    'Authorization': `Bearer ${authToken}`
  });
  
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
    // Create a small dummy file in WORKING_DIR so privilege check has a real target
    fs.writeFileSync(TEST_FILE_PATH, 'integration-test');
    console.log('Created test file:', TEST_FILE_PATH);
    
    await waitForHealth(12000, 200);
    console.log('Server healthy. Authenticating...');
    
    // Register and login to get auth token
    const authToken = await registerAndLogin();
    
    console.log('Running authenticated privilege check...');
    const res = await postPrivilege(TEST_FILE_BASE, authToken);
    console.log('Privilege check status:', res.status);
    console.log('Privilege response body:', res.body);
    
    if (res.status === 200 && res.body && res.body.success) {
      console.log('Integration test passed - authentication and privilege check working');
      try { fs.unlinkSync(TEST_FILE_PATH); console.log('Removed test file'); } catch (e) {}
      srv.kill();
      process.exit(0);
    } else {
      console.error('Integration test failed: unexpected privilege response');
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
