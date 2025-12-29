const http = require('http');

const payload = JSON.stringify({ relPath: 'IMG_6013.jpg' });
const opts = {
  hostname: 'localhost',
  port: 3001,
  path: '/privilege',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = http.request(opts, (res) => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const body = JSON.parse(data);
      console.log('Status:', res.statusCode);
      console.log('Body:', body);

      if (res.statusCode !== 200) {
        process.exitCode = 1;
      }

      // Best-effort: if server returns a { success: false } payload, treat as failure.
      if (body && typeof body === 'object' && body.success === false) {
        process.exitCode = 1;
      }
    } catch (e) {
      console.error('Failed to parse response:', e.message, 'raw:', data);
      process.exitCode = 1;
    }
  });
});

req.on('error', (e) => {
  const message = e && e.message ? e.message : String(e);
  const safeMessage = String(message).replace(/[\r\n]+/g, ' ');
  console.error('Request error:', safeMessage);
  if (e && e.code) {
    const safeCode = String(e.code).replace(/[\r\n]+/g, ' ');
    console.error('Error code:', safeCode);
  }
  console.error('Hint: ensure backend is running on http://localhost:3001');
  console.error('      try: cd server && npm start');
  process.exitCode = 1;
});
req.write(payload);
req.end();
