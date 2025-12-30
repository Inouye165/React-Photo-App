const { execSync, spawn } = require('child_process');
const http = require('http');

function waitForHealth(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      http
        .get(url, (res) => {
          if (res.statusCode === 200) resolve(true);
          else retry();
        })
        .on('error', retry);
    }
    function retry() {
      if (Date.now() - start > timeout) return reject(new Error('Timeout waiting for health'));
      setTimeout(check, 500);
    }
    check();
  });
}

async function main() {
  execSync('docker build -f server/Dockerfile -t photo-app-server:smoke .', { stdio: 'inherit' });
  spawn(
    'docker',
    ['run', '-d', '-p', '3001:3001', '--name', 'photo-app-smoke', 'photo-app-server:smoke'],
    { stdio: 'inherit' },
  );
  await new Promise((r) => setTimeout(r, 2000));
  try {
    await waitForHealth('http://localhost:3001/health');
    http
      .get('http://localhost:3001/health', (res) => {
        const headers = res.headers;
        if (res.statusCode === 200 && headers['content-security-policy']) {
          console.log('Docker smoke: /health OK, security headers present');
        } else {
          console.error('Docker smoke: /health missing security headers');
          process.exit(1);
        }
        cleanup();
      })
      .on('error', (err) => {
        // Sanitize error to prevent log injection - remove control chars and limit length
        const errMessage = err && err.message ? err.message : String(err);
        const safeErr = errMessage.replace(/[\r\n\x00-\x1F\x7F-\x9F]+/g, ' ').substring(0, 500);
        console.error('Docker smoke: /health error:', safeErr);
        cleanup();
        process.exit(1);
      });
  } catch (err) {
    // Sanitize error to prevent log injection - remove control chars and limit length
    const safeErr = String(err).replace(/[\r\n\x00-\x1F\x7F-\x9F]+/g, ' ').substring(0, 500);
    console.error('Docker smoke: health check failed', safeErr);
    cleanup();
    process.exit(1);
  }
}

function cleanup() {
  try {
    execSync('docker rm -f photo-app-smoke', { stdio: 'inherit' });
  } catch {
    // ignore
  }
}

main();
