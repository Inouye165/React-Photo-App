/**
 * Mock for heic-to - browser-only HEIC converter
 * This mock prevents the actual module from loading in Node.js tests
 */
export function heicTo() {
  return Promise.resolve(new Blob(['converted'], { type: 'image/jpeg' }));
}
