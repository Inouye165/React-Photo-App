// Mock for heic2any - prevents WASM loading
export default function heic2any() {
  return Promise.resolve(new Blob(['mock'], { type: 'image/jpeg' }));
}
