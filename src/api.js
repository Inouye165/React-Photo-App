
// Utility to upload photo to backend server
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export async function uploadPhotoToServer(file, serverUrl = `${API_BASE_URL}/upload`) {
  const formData = new FormData();
  formData.append('photo', file, file.name);
  console.log('[UPLOAD] target:', serverUrl, 'file.name:', file && file.name);
  try {
    const response = await fetch(serverUrl, {
      method: 'POST',
      body: formData,
    });
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
        headers: { 'Content-Type': 'application/json' },
        body
      });
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
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch photos: ' + response.status);
  return await response.json();
}

// Update photo state (move to inprogress/working)
export async function updatePhotoState(id, state, serverUrl = `${API_BASE_URL}/photos/`) {
  const response = await fetch(`${serverUrl}${id}/state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state })
  });
  if (!response.ok) throw new Error('Failed to update photo state');
  return await response.json();
}

export async function recheckInprogressPhotos(serverUrl = `${API_BASE_URL}/photos/recheck-inprogress`) {
  const res = await fetch(serverUrl, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to trigger recheck');
  return await res.json();
}

export async function updatePhotoCaption(id, caption, serverUrl = `${API_BASE_URL}`) {
  const res = await fetch(`${serverUrl}/photos/${id}/caption`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caption })
  });
  if (!res.ok) throw new Error('Failed to update caption');
  return await res.json();
}