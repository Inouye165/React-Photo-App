const createPhotosImage = require('../services/photosImage');

describe('photosImage service', () => {
  let sharp, exifr, crypto, service;
  beforeEach(() => {
    sharp = jest.fn(() => ({ jpeg: jest.fn(() => ({ toBuffer: jest.fn().mockResolvedValue(Buffer.from('image')) })) }));
    exifr = { parse: jest.fn().mockResolvedValue({ meta: true }) };
    crypto = { createHash: jest.fn(() => ({ update: jest.fn(function () { return this; }), digest: jest.fn(() => 'abc123') })) };
    service = createPhotosImage({ sharp, exifr, crypto });
  });

  it('converts HEIC to JPEG buffer', async () => {
    const result = await service.convertHeicToJpeg(Buffer.from('src'));
    expect(result.equals(Buffer.from('image'))).toBe(true);
  });

  it('extracts metadata from buffer', async () => {
    const meta = await service.extractMetadata(Buffer.from('src'));
    expect(meta).toHaveProperty('meta', true);
  });

  it('handles exifr parse returning nullish', async () => {
    exifr.parse.mockResolvedValueOnce(null);
    const result = await service.extractMetadata(Buffer.from('src'));
    expect(result).toEqual({});
  });

  it('computes buffer hash', () => {
    const hash = service.computeHash(Buffer.from('src'));
    expect(hash).toBe('abc123');
  });
});
