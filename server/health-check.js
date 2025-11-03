const http = require('http');

http.get('http://localhost:3001/health', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    // Print status and a short body
    const body = (data || '').toString().slice(0, 1000);
    console.log(res.statusCode, body);
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
}).on('error', (err) => {
  console.error('HEALTH_ERROR:', err && err.message ? err.message : err);
  process.exit(2);
});
