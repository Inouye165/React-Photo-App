const fs = require('fs');
const path = require('path');

describe('Environment configuration', () => {
  test('server/.env defines GOOGLE_PLACES_API_KEY', () => {
    const envPath = path.join(__dirname, '..', '.env');
    const envContents = fs.readFileSync(envPath, 'utf8');
    expect(envContents).toMatch(/(^|\n)GOOGLE_PLACES_API_KEY=.+/);
  });
});
