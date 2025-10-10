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
      console.log('Status:', res.statusCode);
      console.log('Body:', JSON.parse(data));
    } catch (e) {
      console.error('Failed to parse response:', e.message, 'raw:', data);
    }
  });
});

req.on('error', (e) => console.error('Request error:', e.message));
req.write(payload);
req.end();
