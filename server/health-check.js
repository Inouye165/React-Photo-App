const http = require('http');

const targets = [
  'http://[::1]:3001/health',
  'http://127.0.0.1:3001/health',
  'http://localhost:3001/health',
];

const deadline = Date.now() + 10_000; // 10s total
function once(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () =>
        resolve({ ok: res.statusCode === 200, code: res.statusCode, body, url })
      );
    });
    req.on('error', () => resolve({ ok: false, code: 'ECONN', url }));
  });
}

async function main() {
  while (Date.now() < deadline) {
    for (const url of targets) {
       
      const r = await once(url);
      if (r.ok) {
        console.log('OK', r.code, r.url);
        process.exit(0);
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error('HEALTHCHECK_FAILED: no 200 from', targets.join(', '));
  process.exit(2);
}
main();
