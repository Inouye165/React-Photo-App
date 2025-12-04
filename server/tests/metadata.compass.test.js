const fs = require('fs');
const path = require('path');
const { extractMetadata } = require('../media/backgroundProcessor');

describe('Metadata Extraction - Compass Heading', () => {
  const testFilePath = path.join(__dirname, 'fixtures', 'test-photo-with-compass.heic');
  let testBuffer;

  beforeAll(() => {
    if (!fs.existsSync(testFilePath)) {
      throw new Error(`Test fixture missing: ${testFilePath}`);
    }
    testBuffer = fs.readFileSync(testFilePath);
  });

  test('should extract GPSImgDirection from HEIC file', async () => {
    const metadata = await extractMetadata(testBuffer, 'test-photo-with-compass.heic');

    // Verify GPS coordinates are present
    expect(metadata.latitude).toBeDefined();
    expect(metadata.longitude).toBeDefined();
    expect(metadata.GPSLatitude).toBeDefined();
    expect(metadata.GPSLongitude).toBeDefined();

    // CRITICAL: Verify compass heading is extracted
    expect(metadata.GPSImgDirection).toBeDefined();
    expect(typeof metadata.GPSImgDirection).toBe('number');
    expect(metadata.GPSImgDirection).toBeGreaterThanOrEqual(0);
    expect(metadata.GPSImgDirection).toBeLessThan(360);

    // Expected value from test file: ~306.14 degrees
    expect(metadata.GPSImgDirection).toBeCloseTo(306.14, 1);
  });

  test('should create normalized gps.direction field', async () => {
    const metadata = await extractMetadata(testBuffer, 'test-photo-with-compass.heic');

    // Verify normalized gps object has direction
    expect(metadata.gps).toBeDefined();
    expect(metadata.gps.direction).toBeDefined();
    expect(metadata.gps.direction).toBe(metadata.GPSImgDirection);
  });

  test('should create normalized GPS.imgDirection field', async () => {
    const metadata = await extractMetadata(testBuffer, 'test-photo-with-compass.heic');

    // Verify normalized GPS object has imgDirection
    expect(metadata.GPS).toBeDefined();
    expect(metadata.GPS.imgDirection).toBeDefined();
    expect(metadata.GPS.imgDirection).toBe(metadata.GPSImgDirection);
  });

  test('should extract all GPS coordinate formats', async () => {
    const metadata = await extractMetadata(testBuffer, 'test-photo-with-compass.heic');

    // Top-level fields (frontend check #1)
    expect(metadata.latitude).toBeDefined();
    expect(metadata.longitude).toBeDefined();

    // Nested gps object with shortened names (frontend check #4)
    expect(metadata.gps).toBeDefined();
    expect(metadata.gps.lat).toBe(metadata.latitude);
    expect(metadata.gps.lon).toBe(metadata.longitude);

    // Nested GPS object with full names (frontend check #3)
    expect(metadata.GPS).toBeDefined();
    expect(metadata.GPS.latitude).toBe(metadata.latitude);
    expect(metadata.GPS.longitude).toBe(metadata.longitude);
  });

  test('should fail if compass heading is missing (regression test)', async () => {
    const metadata = await extractMetadata(testBuffer, 'test-photo-with-compass.heic');

    // This test will FAIL if the HEIC conversion bug returns
    // Bug: converting HEIC to JPEG without preserving EXIF loses GPSImgDirection
    if (!metadata.GPSImgDirection) {
      throw new Error(
        'REGRESSION: GPSImgDirection not extracted from HEIC file. ' +
        'This likely means HEIC conversion is stripping EXIF data. ' +
        'Check that extractMetadata() extracts from original HEIC buffer, ' +
        'not from converted JPEG.'
      );
    }

    expect(metadata.GPSImgDirection).toBeDefined();
  });
});
