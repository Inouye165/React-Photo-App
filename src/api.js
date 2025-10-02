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
