import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  duration: '10m',
  vus: 5,
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(99)<1000'] },
};

const api = __ENV.CHRONIX_API_URL || 'http://localhost:3000';
const token = __ENV.CHRONIX_ACCESS_TOKEN;
const workspaces = (__ENV.CHRONIX_WORKSPACE_IDS || '').split(',').filter(Boolean);

export default function () {
  if (!token || workspaces.length === 0) return;
  const workspaceId = workspaces[__VU % workspaces.length];
  const response = http.get(`${api}/api/v1/workspaces/${workspaceId}/executions?limit=100`, { headers: { Authorization: `Bearer ${token}` } });
  check(response, { 'execution history is available': (res) => res.status === 200 });
  sleep(1);
}
