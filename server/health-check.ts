import http from 'http';

interface HealthResult {
  ok: boolean;
  code: number | string;
  body?: string;
  url: string;
}

const targets: string[] = [
  'http://[::1]:3001/health',
  'http://127.0.0.1:3001/health',
  'http://localhost:3001/health',
];

const deadline: number = Date.now() + 10_000; // 10s total

function once(url: string): Promise<HealthResult> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c: Buffer | string) => (body += c));
      res.on('end', () =>
        resolve({ ok: res.statusCode === 200, code: res.statusCode ?? 0, body, url })
      );
    });
    req.on('error', () => resolve({ ok: false, code: 'ECONN', url }));
  });
}

async function main(): Promise<void> {
  while (Date.now() < deadline) {
    for (const url of targets) {
      const r = await once(url);
      if (r.ok) {
        console.log('OK', r.code, r.url);
        process.exit(0);
      }
    }
    await new Promise<void>((r) => setTimeout(r, 500));
  }
  console.error('HEALTHCHECK_FAILED: no 200 from', targets.join(', '));
  process.exit(2);
}
main();
