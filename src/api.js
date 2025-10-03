
// Utility to upload photo to backend server
export async function uploadPhotoToServer(file, serverUrl = 'http://localhost:3001/upload') {
  const formData = new FormData();
  formData.append('photo', file, file.name);
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
export async function checkPrivilege(relPath, serverUrl = 'http://localhost:3001/privilege') {
  const maxAttempts = 3;
  const delayMs = 250;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relPath })
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
export async function getPhotos(serverUrl = 'http://localhost:3001/photos') {
  const response = await fetch(serverUrl);
  if (!response.ok) throw new Error('Failed to fetch photos');
  return await response.json();
}

// Update photo state (move to inprogress/working)
export async function updatePhotoState(id, state, serverUrl = 'http://localhost:3001/photos/') {
  const response = await fetch(`${serverUrl}${id}/state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state })
  });
  if (!response.ok) throw new Error('Failed to update photo state');
  return await response.json();
}