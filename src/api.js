// Utility to get auth headers for API requests
function getAuthHeaders() {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
}

// Utility to handle auth errors and redirect to login
function handleAuthError(response) {
  if (response.status === 401 || response.status === 403) {
    // Token expired or invalid, clear it and reload page to trigger login
    localStorage.removeItem('authToken');
    window.location.reload();
    return true;
  }
  return false;
}

// Utility to upload photo to backend server
function resolveApiBaseUrl() {
  try {
    // Vite/ESM environment
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL;
    }
  } catch {
    // ignore
  }
  // Check for process only if it exists (Node.js)
  if (typeof globalThis !== 'undefined' && typeof globalThis.process !== 'undefined' && globalThis.process.env && globalThis.process.env.VITE_API_URL) {
    return globalThis.process.env.VITE_API_URL;
  }
  // Use LAN IP for mobile access
  return 'http://10.0.0.126:3001';
}
const API_BASE_URL = resolveApiBaseUrl();
export async function uploadPhotoToServer(file, serverUrl = `${API_BASE_URL}/upload`) {
  const formData = new FormData();
  formData.append('photo', file, file.name);
  console.log('[UPLOAD] target:', serverUrl, 'file.name:', file && file.name);
  
  const token = localStorage.getItem('authToken');
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers,
      body: formData,
    });
    
    if (handleAuthError(response)) return;
    if (!response.ok) throw new Error('Upload failed');
    return await response.json();
  } catch (error) {
    throw new Error('Error uploading photo: ' + error.message);
  }
}

// Utility to check file/folder privileges via backend
export async function checkPrivilege(relPath, serverUrl = `${API_BASE_URL}/privilege`) {
  const maxAttempts = 3;
  const delayMs = 250;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const body = JSON.stringify({ relPath });
      // Log outgoing body so we can detect client-side escaping/formatting issues
      console.log('[API] checkPrivilege ->', serverUrl, 'body:', body);
      const response = await apiLimiter(() => fetch(serverUrl, {
        method: 'POST',
        headers: getAuthHeaders(),
        body
      }));
      if (handleAuthError(response)) return;
      if (response.ok) return await response.json();
      // If 404 or 5xx, retry a few times
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, delayMs * attempt));
        continue;
      }
      throw new Error('Privilege check failed: ' + response.status);
    } catch (error) {
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, delayMs * attempt));
        continue;
      }
      throw new Error('Error checking privilege: ' + error.message);
    }
  }
}

// Utility to check privileges for multiple files in batch
export async function checkPrivilegesBatch(filenames, serverUrl = `${API_BASE_URL}/privilege`) {
  // Chunk large batches to avoid triggering server-side rate limits.
  const CHUNK_SIZE = 12; // reasonable small batch size
  const maxAttempts = 4;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const results = {};
  // Helper to POST a chunk and handle 429/backoff
  async function postChunk(chunk, attempt = 1) {
    try {
      const body = JSON.stringify({ filenames: chunk });
      console.log('[API] checkPrivilegesBatch ->', serverUrl, 'filenames:', chunk.length);
      const response = await apiLimiter(() => fetch(serverUrl, {
        method: 'POST',
        headers: getAuthHeaders(),
        body
      }));
      if (handleAuthError(response)) return null;
      if (response.status === 429) {
        if (attempt < maxAttempts) {
          const backoff = 250 * Math.pow(2, attempt - 1);
          await sleep(backoff);
          return postChunk(chunk, attempt + 1);
        }
        throw new Error('Batch privilege check rate limited: 429');
      }
      if (!response.ok) throw new Error('Batch privilege check failed: ' + response.status);
      const result = await response.json();
      if (!result.success) throw new Error('Batch privilege check error: ' + result.error);
      return result.privileges || {};
    } catch (error) {
      if (attempt < maxAttempts) {
        const backoff = 250 * Math.pow(2, attempt - 1);
        await sleep(backoff);
        return postChunk(chunk, attempt + 1);
      }
      throw error;
    }
  }

  try {
    for (let i = 0; i < filenames.length; i += CHUNK_SIZE) {
      const chunk = filenames.slice(i, i + CHUNK_SIZE);
      const chunkRes = await postChunk(chunk, 1);
      if (chunkRes && typeof chunkRes === 'object') {
        Object.assign(results, chunkRes);
      }
    }
    return results;
  } catch (error) {
    throw new Error('Error checking privileges batch: ' + error.message);
  }
}

// Fetch all photos and metadata from backend
export async function getPhotos(serverUrlOrEndpoint = `${API_BASE_URL}/photos`) {
  // Accept either a full URL or a short endpoint/state token like 'working'|'inprogress'|'finished'
  let url = serverUrlOrEndpoint;
  if (!/^https?:\/\//i.test(serverUrlOrEndpoint)) {
    // If it's a simple state token, build the photos endpoint
    if (['working', 'inprogress', 'finished'].includes(serverUrlOrEndpoint)) {
      url = `${API_BASE_URL}/photos?state=${serverUrlOrEndpoint}`;
    } else if (serverUrlOrEndpoint.startsWith('photos')) {
      // handle values like 'photos?state=working' or 'photos'
      url = `${API_BASE_URL}/${serverUrlOrEndpoint}`;
    } else {
      // fallback to default photos endpoint
      url = `${API_BASE_URL}/photos`;
    }
  }
  console.log('[GET PHOTOS] fetching', url);
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  if (handleAuthError(response)) return;
  if (!response.ok) throw new Error('Failed to fetch photos: ' + response.status);
  return await response.json();
}

// Update photo state (move to inprogress/working)
export async function updatePhotoState(id, state, serverUrl = `${API_BASE_URL}/photos/`) {
  const doFetch = async () => {
    return fetch(`${serverUrl}${id}/state`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ state })
    });
  };

  const response = await stateUpdateLimiter(() => doFetch());
  if (handleAuthError(response)) return;
  if (!response.ok) throw new Error('Failed to update photo state');
  return await response.json();
}

export async function recheckInprogressPhotos(serverUrl = `${API_BASE_URL}/photos/recheck-inprogress`) {
  const res = await apiLimiter(() => fetch(serverUrl, {
    method: 'POST',
    headers: getAuthHeaders()
  }));
  if (handleAuthError(res)) return;
  if (!res.ok) throw new Error('Failed to trigger recheck');
  return await res.json();
}

export async function updatePhotoCaption(id, caption, serverUrl = `${API_BASE_URL}`) {
  const res = await apiLimiter(() => fetch(`${serverUrl}/photos/${id}/caption`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ caption })
  }));
  if (handleAuthError(res)) return;
  if (!res.ok) throw new Error('Failed to update caption');
  return await res.json();
}

// Start AI processing for a photo (fire-and-forget / returns 202 when queued)
export async function runAI(photoId, serverUrl = `${API_BASE_URL}`) {
  const res = await apiLimiter(() => fetch(`${serverUrl}/photos/${photoId}/run-ai`, {
    method: 'POST',
    headers: getAuthHeaders()
  }));
  if (handleAuthError(res)) return;
  if (!res.ok) {
    // If server returns 202 it will be ok; other codes considered failure
    const text = await res.text().catch(() => '');
    throw new Error('Failed to start AI job: ' + text);
  }
  // Some servers return 202 with an empty body which causes res.json() to throw.
  // Parse JSON if present, otherwise continue. Always dispatch the global event
  // so the UI can start polling even when the response body is empty.
  let json = null;
  try {
    json = await res.json();
  } catch {
    // ignore JSON parse errors (empty body is fine)
    json = null;
  }

  try {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      console.debug('[API runAI] dispatching photo:run-ai for', photoId, 'status=', res.status);
      window.dispatchEvent(new CustomEvent('photo:run-ai', { detail: { photoId } }));
    }
    // Also write to localStorage as a cross-window fallback so other tabs/windows
    // will receive a `storage` event and can start polling as well.
    try {
      if (typeof localStorage !== 'undefined' && localStorage.setItem) {
        localStorage.setItem('photo:run-ai', JSON.stringify({ photoId, ts: Date.now() }));
      }
    } catch {
      // ignore localStorage errors
      void 0;
    }
  } catch (e) {
    // ignore event dispatch errors but log for debug
    console.warn('runAI: failed to dispatch event', e && e.message);
  }

  return json;
}

// Fetch a single photo by id. Returns { success: true, photo: { ... } } or similar
export async function getPhoto(photoId, serverUrl = `${API_BASE_URL}`) {
  const res = await fetch(`${serverUrl}/photos/${photoId}`, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  if (handleAuthError(res)) return;
  if (!res.ok) {
    // allow 404 to bubble up as error
    throw new Error('Failed to fetch photo: ' + res.status);
  }
  return await res.json();
}

// Simple concurrency limiter to avoid bursting many requests at once
// Lightweight telemetry for limiter usage. Exported via getApiMetrics().
const apiMetrics = {
  totals: { calls: 0 },
  limiters: {}
};

export function getApiMetrics() {
  try {
    return JSON.parse(JSON.stringify(apiMetrics));
  } catch {
    return { totals: { calls: 0 }, limiters: {} };
  }
}

// Simple concurrency limiter to avoid bursting many requests at once
// Adds lightweight telemetry per limiter so we can tune values in dev.
function createLimiter(maxConcurrency = 6, name = 'default') {
  let active = 0;
  const queue = [];
  // initialize metrics for this limiter
  if (!apiMetrics.limiters[name]) {
    apiMetrics.limiters[name] = { calls: 0, active: 0, queued: 0, maxActiveSeen: 0 };
  }
  const next = () => {
    if (queue.length === 0) return;
    const fn = queue.shift();
    apiMetrics.limiters[name].queued = queue.length;
    fn();
  };
  return async function limit(fn) {
    apiMetrics.totals.calls += 1;
    apiMetrics.limiters[name].calls += 1;
    return new Promise((resolve, reject) => {
      const run = async () => {
        active += 1;
        apiMetrics.limiters[name].active = active;
        if (active > apiMetrics.limiters[name].maxActiveSeen) apiMetrics.limiters[name].maxActiveSeen = active;
        try {
          const r = await fn();
          resolve(r);
        } catch (err) {
          reject(err);
        } finally {
          active -= 1;
          apiMetrics.limiters[name].active = active;
          apiMetrics.limiters[name].queued = queue.length;
          next();
        }
      };
      if (active < maxConcurrency) run(); else { queue.push(run); apiMetrics.limiters[name].queued = queue.length; }
    });
  };
}

// Shared API limiter instance (tunable)
const apiLimiter = createLimiter(6);
// Dedicated limiter for state-update (PATCH) operations which tend to be the
// main source of 429s when many photos are moved concurrently.
const stateUpdateLimiter = createLimiter(2);