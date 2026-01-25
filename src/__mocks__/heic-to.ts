// Mock for heic-to - prevents WASM loading
export function heicTo() {
  return Promise.resolve(new Blob(['mock'], { type: 'image/jpeg' }));
}
