/**
 * Mock for heic2any - browser-only HEIC converter
 * This mock prevents the actual module from loading in Node.js tests
 */
export default function heic2any() {
  return Promise.resolve(new Blob(['converted'], { type: 'image/jpeg' }));
}
