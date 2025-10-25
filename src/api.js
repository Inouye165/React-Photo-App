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
      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: getAuthHeaders(),
        body
      });
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
  try {
    const body = JSON.stringify({ filenames });
    console.log('[API] checkPrivilegesBatch ->', serverUrl, 'filenames:', filenames.length);
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: getAuthHeaders(),
      body
    });
    if (handleAuthError(response)) return;
    if (!response.ok) throw new Error('Batch privilege check failed: ' + response.status);
  const result = await response.json();
  console.log('[API] checkPrivilegesBatch response:', JSON.stringify(result));
  if (!result.success) throw new Error('Batch privilege check error: ' + result.error);
  return result.privileges; // { filename: 'RWX', ... }
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
  const response = await fetch(`${serverUrl}${id}/state`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ state })
  });
  if (handleAuthError(response)) return;
  if (!response.ok) throw new Error('Failed to update photo state');
  return await response.json();
}

export async function recheckInprogressPhotos(serverUrl = `${API_BASE_URL}/photos/recheck-inprogress`) {
  const res = await fetch(serverUrl, { 
    method: 'POST',
    headers: getAuthHeaders()
  });
  if (handleAuthError(res)) return;
  if (!res.ok) throw new Error('Failed to trigger recheck');
  return await res.json();
}

export async function updatePhotoCaption(id, caption, serverUrl = `${API_BASE_URL}`) {
  const res = await fetch(`${serverUrl}/photos/${id}/caption`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ caption })
  });
  if (handleAuthError(res)) return;
  if (!res.ok) throw new Error('Failed to update caption');
  return await res.json();
}

// Start AI processing for a photo (fire-and-forget / returns 202 when queued)
export async function runAI(photoId, serverUrl = `${API_BASE_URL}`) {
  const res = await fetch(`${serverUrl}/photos/${photoId}/run-ai`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
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