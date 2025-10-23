// Simple test to call the photos API and see thumbnail URLs
const https = require('https');

function makeRequest(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          json: () => Promise.resolve(JSON.parse(data)),
          headers: { get: (name) => res.headers[name.toLowerCase()] }
        });
      });
    });
    req.on('error', reject);
  });
}

async function testPhotosAPI() {
  try {
    // Test the photos API to see what thumbnail URLs are returned
    const response = await makeRequest('http://localhost:3001/photos?state=working', {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NCwidXNlcm5hbWUiOiJkb2JieSIsImVtYWlsIjoiZG9iYkBmYWtlLmNvbSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc2MTE4MDYxMSwiZXhwIjoxNzYxMjY3MDExfQ.xCRJEngBX2H75vLCl9n65RaAbYPsLSgSc6YyXTKy4cI'
    });
    
    if (!response.ok) {
      console.log('❌ API Error:', response.status, response.statusText);
      return;
    }
    
    const data = await response.json();
    
    console.log('📸 API Response for working photos:');
    console.log('Total photos:', data.photos?.length || 0);
    
    if (data.photos && data.photos.length > 0) {
      const firstPhoto = data.photos[0];
      console.log('\n🖼️ First photo example:');
      console.log('Filename:', firstPhoto.filename);
      console.log('Main URL:', firstPhoto.url);
      console.log('Thumbnail URL:', firstPhoto.thumbnail);
      
      if (firstPhoto.thumbnail) {
        console.log('\n🔍 Testing thumbnail endpoint...');
        const thumbResponse = await makeRequest(`http://localhost:3001${firstPhoto.thumbnail}?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NCwidXNlcm5hbWUiOiJkb2JieSIsImVtYWlsIjoiZG9iYkBmYWtlLmNvbSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc2MTE4MDYxMSwiZXhwIjoxNzYxMjY3MDExfQ.xCRJEngBX2H75vLCl9n65RaAbYPsLSgSc6YyXTKy4cI`);
        
        if (thumbResponse.ok) {
          console.log('✅ Thumbnail endpoint works! Status:', thumbResponse.status);
          console.log('Content-Type:', thumbResponse.headers.get('content-type'));
        } else {
          console.log('❌ Thumbnail endpoint failed:', thumbResponse.status, thumbResponse.statusText);
        }
      } else {
        console.log('❌ No thumbnail URL in response');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testPhotosAPI();