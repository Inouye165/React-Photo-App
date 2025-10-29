// Rewritten clean API module (single copy) with small dedupe caches for
// getPhotos and checkPrivilegesBatch to avoid duplicate network requests
// during dev (StrictMode) or accidental double-invokes.

// --- Helpers
function getAuthHeaders() {
  // Authentication is handled with httpOnly cookies (credentials: 'include').
  // Do not rely on localStorage for auth tokens.
  return {
    'Content-Type': 'application/json',
  };
}

function handleAuthError(response) {
  if (!response) return false;
  if (response.status === 401 || response.status === 403) {
    // If cookie-based auth is invalid/expired, refresh the app so user can re-authenticate.
    try { window.location.reload(); } catch { /* ignore */ }
    return true;
  }
  return false;
}

function resolveApiBaseUrl() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL;
    }
  } catch (e) { void e; }
  if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env && globalThis.process.env.VITE_API_URL) {
    return globalThis.process.env.VITE_API_URL;
  }
  return 'http://10.0.0.126:3001';
}
const API_BASE_URL = resolveApiBaseUrl();

// --- Concurrency limiter (small utility used across API calls)
const apiMetrics = { totals: { calls: 0 }, limiters: {} };
function createLimiter(maxConcurrency = 6, name = 'default') {
  let active = 0;
  const queue = [];
  if (!apiMetrics.limiters[name]) apiMetrics.limiters[name] = { calls: 0, active: 0, queued: 0, maxActiveSeen: 0 };
  const next = () => { if (queue.length === 0) return; const fn = queue.shift(); apiMetrics.limiters[name].queued = queue.length; fn(); };
  return async function limit(fn) {
    apiMetrics.totals.calls += 1; apiMetrics.limiters[name].calls += 1;
    return new Promise((resolve, reject) => {
      const run = async () => {
        active += 1; apiMetrics.limiters[name].active = active;
        if (active > apiMetrics.limiters[name].maxActiveSeen) apiMetrics.limiters[name].maxActiveSeen = active;
        try { const r = await fn(); resolve(r); } catch (err) { reject(err); } finally { active -= 1; apiMetrics.limiters[name].active = active; apiMetrics.limiters[name].queued = queue.length; next(); }
      };
      if (active < maxConcurrency) run(); else { queue.push(run); apiMetrics.limiters[name].queued = queue.length; }
    });
  };
}
const apiLimiter = createLimiter(6);
const stateUpdateLimiter = createLimiter(2);

export function getApiMetrics() { try { return JSON.parse(JSON.stringify(apiMetrics)); } catch { return { totals: { calls: 0 }, limiters: {} }; } }

// --- API functions
// Centralized login helper
// NOTE: The repository uses API_BASE_URL as the configured backend origin.
// The original plan referenced `backendOrigin`; here we use `API_BASE_URL` to
// satisfy the same intent.
export async function loginUser(username, password, serverUrl = `${API_BASE_URL}`) {
  const url = `${serverUrl}/auth/login`;
  const body = JSON.stringify({ username, password });
  const response = await fetch(url, { method: 'POST', headers: getAuthHeaders(), body, credentials: 'include' });
  if (!response.ok) {
    // Try to parse JSON error body, fall back to status text
    try {
      const json = await response.json();
      const msg = (json && (json.error || json.message)) ? (json.error || json.message) : JSON.stringify(json);
      throw new Error(msg || `Login failed: ${response.status}`);
    } catch {
      throw new Error(response.statusText || `Login failed: ${response.status}`);
    }
  }
  return await response.json();
}

export async function uploadPhotoToServer(file, serverUrl = `${API_BASE_URL}/upload`) {
  // Use FormData and rely on cookie-based auth (credentials included).
  const form = new FormData(); form.append('photo', file, file.name);
  const res = await fetch(serverUrl, { method: 'POST', body: form, credentials: 'include' });
  if (handleAuthError(res)) return; if (!res.ok) throw new Error('Upload failed'); return await res.json();
}

export async function checkPrivilege(relPath, serverUrl = `${API_BASE_URL}/privilege`) {
  const maxAttempts = 3; const delayMs = 250;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const body = JSON.stringify({ relPath });
  const response = await apiLimiter(() => fetch(serverUrl, { method: 'POST', headers: getAuthHeaders(), body, credentials: 'include' }));
      if (handleAuthError(response)) return; if (response.ok) return await response.json();
      if (attempt < maxAttempts) { await new Promise(r => setTimeout(r, delayMs * attempt)); continue; }
      throw new Error('Privilege check failed: ' + response.status);
    } catch (err) { if (attempt < maxAttempts) { await new Promise(r => setTimeout(r, delayMs * attempt)); continue; } throw err; }
  }
}

export async function checkPrivilegesBatch(filenames, serverUrl = `${API_BASE_URL}/privilege`) {
  if (!Array.isArray(filenames)) filenames = [];
  if (!globalThis.__privBatchCache) globalThis.__privBatchCache = new Map();
  const key = filenames.slice().sort().join('|');
  const TTL = 1200; const now = Date.now(); const existing = globalThis.__privBatchCache.get(key);
  if (existing && (now - existing.ts) < TTL) return existing.promise;

  const CHUNK_SIZE = 12; const maxAttempts = 4; const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const results = {};
  async function postChunk(chunk, attempt = 1) {
    try {
      const body = JSON.stringify({ filenames: chunk });
  const response = await apiLimiter(() => fetch(serverUrl, { method: 'POST', headers: getAuthHeaders(), body, credentials: 'include' }));
      if (handleAuthError(response)) return null;
      if (response.status === 429) { if (attempt < maxAttempts) { await sleep(250 * Math.pow(2, attempt - 1)); return postChunk(chunk, attempt + 1); } throw new Error('Batch privilege check rate limited: 429'); }
      if (!response.ok) throw new Error('Batch privilege check failed: ' + response.status);
      const json = await response.json(); if (!json.success) throw new Error('Batch privilege check error: ' + json.error); return json.privileges || {};
    } catch (e) { if (attempt < maxAttempts) { await sleep(250 * Math.pow(2, attempt - 1)); return postChunk(chunk, attempt + 1); } throw e; }
  }

  const promise = (async () => {
    for (let i = 0; i < filenames.length; i += CHUNK_SIZE) {
      const chunk = filenames.slice(i, i + CHUNK_SIZE);
      const chunkRes = await postChunk(chunk, 1);
      if (chunkRes && typeof chunkRes === 'object') Object.assign(results, chunkRes);
    }
    return results;
  })();

  globalThis.__privBatchCache.set(key, { ts: Date.now(), promise });
  try { const res = await promise; return res; } catch (e) { throw new Error('Error checking privileges batch: ' + e.message); }
}

export async function getPhotos(serverUrlOrEndpoint = `${API_BASE_URL}/photos`) {
  let url = serverUrlOrEndpoint;
  if (!/^https?:\/\//i.test(serverUrlOrEndpoint)) {
    if (['working', 'inprogress', 'finished'].includes(serverUrlOrEndpoint)) url = `${API_BASE_URL}/photos?state=${serverUrlOrEndpoint}`;
    else if (serverUrlOrEndpoint.startsWith('photos')) url = `${API_BASE_URL}/${serverUrlOrEndpoint}`;
    else url = `${API_BASE_URL}/photos`;
  }

  if (!globalThis.__getPhotosInflight) globalThis.__getPhotosInflight = new Map();
  const TTL = 1000; const key = url; const now = Date.now(); const cached = globalThis.__getPhotosInflight.get(key);
  if (cached && (now - cached.ts) < TTL) return cached.promise;

  const fetchPromise = (async () => {
  const response = await fetch(url, { headers: getAuthHeaders(), credentials: 'include' });
    if (handleAuthError(response)) return; if (!response.ok) throw new Error('Failed to fetch photos: ' + response.status);
    return await response.json();
  })();

  globalThis.__getPhotosInflight.set(key, { ts: Date.now(), promise: fetchPromise });
  try { const res = await fetchPromise; return res; } finally { setTimeout(() => { try { globalThis.__getPhotosInflight.delete(key); } catch (e) { void e; } }, TTL); }
}

export async function updatePhotoState(id, state, serverUrl = `${API_BASE_URL}/photos/`) {
  const doFetch = async () => fetch(`${serverUrl}${id}/state`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ state }), credentials: 'include' });
  const response = await stateUpdateLimiter(() => doFetch());
  if (handleAuthError(response)) return; if (!response.ok) throw new Error('Failed to update photo state'); return await response.json();
}

export async function recheckInprogressPhotos(serverUrl = `${API_BASE_URL}/photos/recheck-inprogress`) {
  const res = await apiLimiter(() => fetch(serverUrl, { method: 'POST', headers: getAuthHeaders(), credentials: 'include' }));
  if (handleAuthError(res)) return; if (!res.ok) throw new Error('Failed to trigger recheck'); return await res.json();
}

export async function updatePhotoCaption(id, caption, serverUrl = `${API_BASE_URL}`) {
  const res = await apiLimiter(() => fetch(`${serverUrl}/photos/${id}/caption`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ caption }), credentials: 'include' }));
  if (handleAuthError(res)) return; if (!res.ok) throw new Error('Failed to update caption'); return await res.json();
}

export async function runAI(photoId, serverUrl = `${API_BASE_URL}`) {
  const res = await apiLimiter(() => fetch(`${serverUrl}/photos/${photoId}/run-ai`, { method: 'POST', headers: getAuthHeaders(), credentials: 'include' }));
  if (handleAuthError(res)) return; if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error('Failed to start AI job: ' + text); }
  try { const json = await res.json().catch(() => null); try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new CustomEvent('photo:run-ai', { detail: { photoId } })); } catch (e) { void e; } try { localStorage.setItem('photo:run-ai', JSON.stringify({ photoId, ts: Date.now() })); } catch (e) { void e; } return json; } catch { return null; }
}

export async function getPhoto(photoId, serverUrl = `${API_BASE_URL}`) {
  const res = await fetch(`${serverUrl}/photos/${photoId}`, { method: 'GET', headers: getAuthHeaders(), credentials: 'include' }); if (handleAuthError(res)) return; if (!res.ok) throw new Error('Failed to fetch photo: ' + res.status); return await res.json();
}
