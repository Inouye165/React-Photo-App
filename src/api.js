import { supabase } from './supabaseClient';

let accessToken = null;

// --- Collectibles API ---
/**
 * Fetch all collectibles for a given photoId
 */
export async function fetchCollectibles(photoId) {
  const url = `${API_BASE_URL}/photos/${photoId}/collectibles`;
  const res = await apiLimiter(() => fetch(url, { headers: getAuthHeaders() }));
  if (handleAuthError(res)) return;
  if (!res.ok) throw new Error('Failed to fetch collectibles: ' + res.status);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to fetch collectibles');
  return json.collectibles;
}

/**
 * Create a new collectible for a photo
 */
export async function createCollectible(photoId, data) {
  const url = `${API_BASE_URL}/photos/${photoId}/collectibles`;
  const res = await apiLimiter(() => fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
    
  }));
  if (handleAuthError(res)) return;
  if (!res.ok) throw new Error('Failed to create collectible: ' + res.status);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to create collectible');
  return json.collectible;
}

/**
 * Update a collectible's user_notes
 */
export async function updateCollectible(collectibleId, data) {
  const url = `${API_BASE_URL}/collectibles/${collectibleId}`;
  const res = await apiLimiter(() => fetch(url, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
    
  }));
  if (handleAuthError(res)) return;
  if (!res.ok) throw new Error('Failed to update collectible: ' + res.status);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to update collectible');
  return json.collectible;
}
// Rewritten clean API module (single copy) with small dedupe caches for
// getPhotos and checkPrivilegesBatch to avoid duplicate network requests
// during dev (StrictMode) or accidental double-invokes.

// --- Helpers
export function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return headers;
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
  return 'http://localhost:3001';
}
export const API_BASE_URL = resolveApiBaseUrl();

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

/**
 * Fetch a protected resource (image) using credentials and return a blob URL.
 * Caller is responsible for revoking the returned URL when no longer needed.
 * @param {string} url - Full URL to fetch (absolute or relative)
 * @returns {Promise<string>} - Object URL (URL.createObjectURL(blob))
 */
export async function fetchProtectedBlobUrl(url) {
  // If URL is already a blob URL, return it as is
  if (url.startsWith('blob:')) return url;

  // Append token to URL if available
  let fetchUrl = url;
  if (accessToken) {
    const separator = fetchUrl.includes('?') ? '&' : '?';
    fetchUrl = `${fetchUrl}${separator}token=${accessToken}`;
  }

  const res = await fetch(fetchUrl, {
    headers: getAuthHeaders()
  });
  
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function revokeBlobUrl(url) {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

// fetchCsrfToken removed
// loginUser removed

export async function uploadPhotoToServer(file, serverUrl = `${API_BASE_URL}/upload`) {
  // Use FormData and rely on cookie-based auth (credentials included).
  const form = new FormData(); form.append('photo', file, file.name);
  
  const headers = getAuthHeaders();
  delete headers['Content-Type']; // Let browser set multipart/form-data with boundary

  const res = await fetch(serverUrl, { method: 'POST', headers, body: form });
  if (handleAuthError(res)) return; if (!res.ok) throw new Error('Upload failed'); return await res.json();
}

export async function checkPrivilege(relPath, serverUrl = `${API_BASE_URL}/privilege`) {
  const maxAttempts = 3; const delayMs = 250;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const body = JSON.stringify({ relPath });
  const response = await apiLimiter(() => fetch(serverUrl, { method: 'POST', headers: getAuthHeaders(), body }));
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
  const response = await apiLimiter(() => fetch(serverUrl, { method: 'POST', headers: getAuthHeaders(), body }));
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

// Utility: fetch with AbortController and timeout
async function fetchWithTimeout(resource, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(resource, { ...options, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(id);
  }
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
  // Protect UI from indefinite hangs if backend is not responding.
  const response = await fetchWithTimeout(url, { headers: getAuthHeaders() }, 20000);
    if (handleAuthError(response)) return; if (!response.ok) throw new Error('Failed to fetch photos: ' + response.status);
    return await response.json();
  })();

  globalThis.__getPhotosInflight.set(key, { ts: Date.now(), promise: fetchPromise });
  try { const res = await fetchPromise; return res; } finally { setTimeout(() => { try { globalThis.__getPhotosInflight.delete(key); } catch (e) { void e; } }, TTL); }
}

export async function fetchModelAllowlist(serverUrl = `${API_BASE_URL}`) {
  const root = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
  const CACHE_KEY = '__photoModelAllowlistCache';
  const TTL = 60_000;
  const now = Date.now();
  const cache = root[CACHE_KEY];
  if (cache && cache.data && (now - cache.ts) < TTL) {
    return cache.data;
  }
  if (cache && cache.promise) {
    return cache.promise;
  }

  const url = `${serverUrl}/photos/models`;
  const fetchPromise = (async () => {
    const response = await apiLimiter(() => fetch(url, { method: 'GET', headers: getAuthHeaders() }));
    if (handleAuthError(response)) {
      const payload = { models: [], source: 'auth', updatedAt: null };
      root[CACHE_KEY] = { ts: Date.now(), data: payload };
      return payload;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch model allowlist: ${response.status}`);
    }
    const json = await response.json().catch(() => ({}));
    const models = Array.isArray(json.models) ? json.models.filter(item => typeof item === 'string' && item.length > 0) : [];
    const payload = {
      models,
      source: typeof json.source === 'string' ? json.source : 'unknown',
      updatedAt: typeof json.updatedAt === 'string' ? json.updatedAt : null
    };
    root[CACHE_KEY] = { ts: Date.now(), data: payload };
    return payload;
  })();

  root[CACHE_KEY] = { ts: now, promise: fetchPromise };
  try {
    const result = await fetchPromise;
    return result;
  } catch (error) {
    try { delete root[CACHE_KEY]; } catch { /* ignore */ }
    throw error;
  }
}

export async function getDependencyStatus(serverUrl = `${API_BASE_URL}`) {
  const url = `${serverUrl}/photos/dependencies`;
  const response = await apiLimiter(() => fetch(url, { method: 'GET', headers: getAuthHeaders() }));
  if (handleAuthError(response)) return null;
  if (!response.ok) {
    throw new Error('Failed to fetch dependency status: ' + response.status);
  }
  const json = await response.json().catch(() => ({}));
  const dependencies = (json && typeof json.dependencies === 'object' && json.dependencies !== null)
    ? json.dependencies
    : {};
  return {
    success: json && json.success !== false,
    dependencies,
  };
}

export async function updatePhotoState(id, state, serverUrl = `${API_BASE_URL}/photos/`) {
  const doFetch = async () => fetch(`${serverUrl}${id}/state`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ state }) });
  const response = await stateUpdateLimiter(() => doFetch());
  if (handleAuthError(response)) return; if (!response.ok) throw new Error('Failed to update photo state'); return await response.json();
}

export async function recheckInprogressPhotos(serverUrl = `${API_BASE_URL}/photos/recheck-inprogress`) {
  const res = await apiLimiter(() => fetch(serverUrl, { method: 'POST', headers: getAuthHeaders() }));
  if (handleAuthError(res)) return; if (!res.ok) throw new Error('Failed to trigger recheck'); return await res.json();
}

export async function recheckPhotoAI(photoId, model = null, serverUrl = `${API_BASE_URL}`) {
  const url = `${serverUrl}/photos/${photoId}/run-ai`;
  const body = model ? JSON.stringify({ model }) : null;
  const opts = { method: 'POST', headers: getAuthHeaders() };
  if (body) {
    opts.body = body;
    opts.headers = { ...opts.headers, 'Content-Type': 'application/json' };
  }
  const res = await apiLimiter(() => fetch(url, opts));
  if (handleAuthError(res)) return; if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('Failed to trigger photo recheck: ' + (text || res.status));
  }
  try {
    const json = await res.json().catch(() => null);
    // Notify other windows/tabs that an AI run has been started for this photo
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        try { window.dispatchEvent(new CustomEvent('photo:run-ai', { detail: { photoId } })); } catch { /* ignore */ }
      }
      try { localStorage.setItem('photo:run-ai', JSON.stringify({ photoId, timestamp: Date.now() })); } catch { /* ignore */ }
    } catch { /* ignore cross-window notify errors */ }
    return json;
  } catch {
    return null;
  }
}

export async function updatePhotoCaption(id, caption, serverUrl = `${API_BASE_URL}`) {
  const res = await apiLimiter(() => fetch(`${serverUrl}/photos/${id}/caption`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ caption }) }));
  if (handleAuthError(res)) return; if (!res.ok) throw new Error('Failed to update caption'); return await res.json();
}

export async function deletePhoto(id, serverUrl = `${API_BASE_URL}`) {
  const url = `${serverUrl}/photos/${id}`;
  const res = await apiLimiter(() => fetch(url, { method: 'DELETE', headers: getAuthHeaders() }));
  if (handleAuthError(res)) return;
  if (!res.ok) {
    // Try to parse error body for a useful message
    let body = null;
    try { body = await res.json(); } catch { try { body = await res.text(); } catch { body = null; } }
    const msg = (body && (body.error || body.message)) ? (body.error || body.message) : (typeof body === 'string' && body.length ? body : res.statusText || `Failed to delete photo: ${res.status}`);
    const err = new Error(msg);
    // attach status so callers can detect 401/403 and reload if desired
    try { err.status = res.status; } catch { /* ignore */ }
    throw err;
  }
  // Return parsed JSON when available, otherwise true
  try { return await res.json(); } catch { return true; }
}

// runAI client helper intentionally removed; use recheckPhotoAI(photoId) instead.

export async function getPhoto(photoId, options = {}, serverUrl = `${API_BASE_URL}`) {
    let url = `${serverUrl}/photos/${photoId}`;
    
    // FIX: Append the cache-buster if provided to force a fresh request
    if (options.cacheBuster) {
      url += (url.includes('?') ? '&' : '?') + `_cb=${options.cacheBuster}`;
    }
    
    const res = await fetch(url, { method: 'GET', headers: getAuthHeaders() }); 
    if (handleAuthError(res)) return; 
    if (!res.ok) throw new Error('Failed to fetch photo: ' + res.status); 
    return await res.json();
}

// Keep token updated
supabase.auth.onAuthStateChange((event, session) => {
  accessToken = session?.access_token || null;
});

// Initialize token
supabase.auth.getSession().then(({ data: { session } }) => {
  accessToken = session?.access_token || null;
});
