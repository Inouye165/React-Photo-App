import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 20,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<300'],
  },
};

export default function () {
  const res = http.get('http://localhost:3001/health');
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(1);
}
