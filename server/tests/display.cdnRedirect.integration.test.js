const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-display-cdn';

jest.mock('../media/image', () => ({
  convertHeicToJpegBuffer: jest.fn()
}));

const { convertHeicToJpegBuffer } = require('../media/image');

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function insertPhotoAndGetId(db, photoRow) {
  // Knex insert return values differ across DBs/drivers; avoid depending on them.
  // Use a unique filename per test and read back the inserted row's id.
  await db('photos').where({ filename: photoRow.filename }).delete();
  await db('photos').insert(photoRow);

  const inserted = await db('photos')
    .select('id')
    .where({ filename: photoRow.filename })
    .orderBy('id', 'desc')
    .first();

  if (!inserted || inserted.id == null) {
    throw new Error(`Failed to look up inserted photo id for filename: ${photoRow.filename}`);
  }

  return inserted.id;
}

function makeMaybeSingle(result) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => result
        })
      })
    })
  };
}

function makeMessageQuery(result) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => result
            })
          })
        })
      })
    })
  };
}

jest.mock('../lib/supabaseClient', () => {
  const mockStorageApi = {
    createSignedUrl: jest.fn(),
    download: jest.fn()
  };

  return {
    storage: {
      from: jest.fn(() => mockStorageApi)
    },
    from: jest.fn(),
    __mock: {
      storageApi: mockStorageApi
    }
  };
});

const app = require('../server');
const db = require('../db/index');
const supabase = require('../lib/supabaseClient');

const storageApi = supabase.__mock.storageApi;

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const CHAT_SENDER_USER_ID = '00000000-0000-0000-0000-000000000002';

describe('Display CDN redirect integration', () => {
  let authToken;

  beforeAll(() => {
    authToken = jwt.sign({ sub: TEST_USER_ID, email: 'test@example.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    storageApi.createSignedUrl.mockReset();
    storageApi.download.mockReset();
  });

  afterAll(async () => {
    await db.destroy();
  });

  test('GET /display/image/:photoId redirects for non-HEIC and does not download/convert', async () => {
    const filename = `cdn-nonheic-${uniqueSuffix()}.jpg`;
    const storagePath = `working/${filename}`;

    const photoId = await insertPhotoAndGetId(db, {
      user_id: TEST_USER_ID,
      filename,
      state: 'working',
      hash: `h-${filename}`,
      file_size: 123,
      metadata: '{}',
      storage_path: storagePath,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    storageApi.createSignedUrl.mockResolvedValue({
      data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/photos/${storagePath}?token=fake` },
      error: null
    });

    const res = await request(app)
      .get(`/display/image/${photoId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(302);

    expect(res.headers.location).toBeTruthy();
    expect(res.headers.location).toMatch(/\/storage\/v1\/object\/sign\//);
    expect(res.headers['cache-control']).toContain('private');

    expect(storageApi.download).not.toHaveBeenCalled();
    expect(convertHeicToJpegBuffer).not.toHaveBeenCalled();

    await db('photos').where({ id: photoId }).delete();
  });

  test('GET /display/image/:photoId streams JPEG for HEIC and converts server-side', async () => {
    const filename = `cdn-heic-${uniqueSuffix()}.heic`;
    const storagePath = `working/${filename}`;

    const photoId = await insertPhotoAndGetId(db, {
      user_id: TEST_USER_ID,
      filename,
      state: 'working',
      hash: `h-${filename}`,
      file_size: 123,
      metadata: '{}',
      storage_path: storagePath,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    storageApi.download.mockResolvedValue({
      data: new Blob([Buffer.from('fake-heic-bytes')]),
      error: null
    });

    convertHeicToJpegBuffer.mockResolvedValue(Buffer.from('converted-jpeg'));

    const res = await request(app)
      .get(`/display/image/${photoId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(convertHeicToJpegBuffer).toHaveBeenCalled();
    expect(storageApi.createSignedUrl).not.toHaveBeenCalled();

    await db('photos').where({ id: photoId }).delete();
  });

  test('GET /display/image/:photoId redirects for HEIC when display_path is present (no conversion)', async () => {
    const filename = `cdn-heic-display-${uniqueSuffix()}.heic`;
    const storagePath = `working/${filename}`;
    const displayPath = `display/${TEST_USER_ID}/p-${uniqueSuffix()}.jpg`;

    const photoId = await insertPhotoAndGetId(db, {
      user_id: TEST_USER_ID,
      filename,
      state: 'working',
      hash: `h-${filename}`,
      file_size: 123,
      metadata: '{}',
      storage_path: storagePath,
      display_path: displayPath,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    storageApi.createSignedUrl.mockResolvedValue({
      data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/photos/${displayPath}?token=fake` },
      error: null
    });

    const res = await request(app)
      .get(`/display/image/${photoId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(302);

    expect(res.headers.location).toContain(displayPath);
    expect(storageApi.download).not.toHaveBeenCalled();
    expect(convertHeicToJpegBuffer).not.toHaveBeenCalled();

    await db('photos').where({ id: photoId }).delete();
  });

  test('GET /display/image/:photoId?raw=1 streams JPEG for HEIC when display_path is present (no conversion)', async () => {
    const filename = `cdn-heic-display-raw-${uniqueSuffix()}.heic`;
    const storagePath = `working/${filename}`;
    const displayPath = `display/${TEST_USER_ID}/p-${uniqueSuffix()}.jpg`;

    const photoId = await insertPhotoAndGetId(db, {
      user_id: TEST_USER_ID,
      filename,
      state: 'working',
      hash: `h-${filename}`,
      file_size: 123,
      metadata: '{}',
      storage_path: storagePath,
      display_path: displayPath,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    storageApi.download.mockResolvedValue({
      data: new Blob([Buffer.from('fake-display-jpg')]),
      error: null
    });

    const res = await request(app)
      .get(`/display/image/${photoId}?raw=1`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(storageApi.download).toHaveBeenCalled();
    expect(storageApi.createSignedUrl).not.toHaveBeenCalled();
    expect(convertHeicToJpegBuffer).not.toHaveBeenCalled();

    await db('photos').where({ id: photoId }).delete();
  });

  test('GET /display/image/:photoId?raw=1 streams bytes for non-HEIC (bypasses redirect)', async () => {
    const filename = `cdn-nonheic-raw-${uniqueSuffix()}.jpg`;
    const storagePath = `working/${filename}`;

    const photoId = await insertPhotoAndGetId(db, {
      user_id: TEST_USER_ID,
      filename,
      state: 'working',
      hash: `h-${filename}`,
      file_size: 123,
      metadata: '{}',
      storage_path: storagePath,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    storageApi.createSignedUrl.mockResolvedValue({
      data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/photos/${storagePath}?token=fake` },
      error: null
    });

    storageApi.download.mockResolvedValue({
      data: new Blob([Buffer.from('fake-jpg-bytes')]),
      error: null
    });

    const res = await request(app)
      .get(`/display/image/${photoId}?raw=1`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(storageApi.download).toHaveBeenCalled();
    expect(storageApi.createSignedUrl).not.toHaveBeenCalled();
    expect(convertHeicToJpegBuffer).not.toHaveBeenCalled();

    await db('photos').where({ id: photoId }).delete();
  });

  test('GET /display/chat-image/:roomId/:photoId redirects for non-HEIC and does not download/convert', async () => {
    const filename = `chat-nonheic-${uniqueSuffix()}.jpg`;
    const storagePath = `working/${filename}`;

    const photoId = await insertPhotoAndGetId(db, {
      user_id: CHAT_SENDER_USER_ID,
      filename,
      state: 'working',
      hash: `h-${filename}`,
      file_size: 123,
      metadata: '{}',
      storage_path: storagePath,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Ensure the mocked message lookup returns this photoId
    supabase.from.mockImplementation((table) => {
      if (table === 'room_members') {
        return makeMaybeSingle({ data: { user_id: TEST_USER_ID }, error: null });
      }
      if (table === 'messages') {
        return makeMessageQuery({
          data: { id: 'm1', room_id: 'r1', sender_id: CHAT_SENDER_USER_ID, photo_id: String(photoId), created_at: new Date().toISOString() },
          error: null
        });
      }
      throw new Error(`Unexpected supabase table: ${table}`);
    });

    storageApi.createSignedUrl.mockResolvedValue({
      data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/photos/${storagePath}?token=fake` },
      error: null
    });

    const res = await request(app)
      .get(`/display/chat-image/r1/${photoId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(302);

    expect(res.headers.location).toBeTruthy();
    expect(res.headers.location).toMatch(/\/storage\/v1\/object\/sign\//);
    expect(res.headers['cache-control']).toContain('private');

    expect(storageApi.download).not.toHaveBeenCalled();
    expect(convertHeicToJpegBuffer).not.toHaveBeenCalled();

    await db('photos').where({ id: photoId }).delete();
  });

  test('GET /display/chat-image/:roomId/:photoId streams JPEG for HEIC and converts server-side', async () => {
    const filename = `chat-heic-${uniqueSuffix()}.heic`;
    const storagePath = `working/${filename}`;

    const photoId = await insertPhotoAndGetId(db, {
      user_id: CHAT_SENDER_USER_ID,
      filename,
      state: 'working',
      hash: `h-${filename}`,
      file_size: 123,
      metadata: '{}',
      storage_path: storagePath,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    supabase.from.mockImplementation((table) => {
      if (table === 'room_members') {
        return makeMaybeSingle({ data: { user_id: TEST_USER_ID }, error: null });
      }
      if (table === 'messages') {
        return makeMessageQuery({
          data: { id: 'm2', room_id: 'r1', sender_id: CHAT_SENDER_USER_ID, photo_id: String(photoId), created_at: new Date().toISOString() },
          error: null
        });
      }
      throw new Error(`Unexpected supabase table: ${table}`);
    });

    storageApi.download.mockResolvedValue({
      data: new Blob([Buffer.from('fake-heic-bytes')]),
      error: null
    });

    convertHeicToJpegBuffer.mockResolvedValue(Buffer.from('converted-jpeg'));

    const res = await request(app)
      .get(`/display/chat-image/r1/${photoId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(convertHeicToJpegBuffer).toHaveBeenCalled();
    expect(storageApi.createSignedUrl).not.toHaveBeenCalled();

    await db('photos').where({ id: photoId }).delete();
  });

  test('GET /display/chat-image/:roomId/:photoId redirects for HEIC when display_path is present (no conversion)', async () => {
    const filename = `chat-heic-display-${uniqueSuffix()}.heic`;
    const storagePath = `working/${filename}`;
    const displayPath = `display/${CHAT_SENDER_USER_ID}/p-${uniqueSuffix()}.jpg`;

    const photoId = await insertPhotoAndGetId(db, {
      user_id: CHAT_SENDER_USER_ID,
      filename,
      state: 'working',
      hash: `h-${filename}`,
      file_size: 123,
      metadata: '{}',
      storage_path: storagePath,
      display_path: displayPath,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    supabase.from.mockImplementation((table) => {
      if (table === 'room_members') {
        return makeMaybeSingle({ data: { user_id: TEST_USER_ID }, error: null });
      }
      if (table === 'messages') {
        return makeMessageQuery({
          data: { id: 'm-display', room_id: 'r1', sender_id: CHAT_SENDER_USER_ID, photo_id: String(photoId), created_at: new Date().toISOString() },
          error: null
        });
      }
      throw new Error(`Unexpected supabase table: ${table}`);
    });

    storageApi.createSignedUrl.mockResolvedValue({
      data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/photos/${displayPath}?token=fake` },
      error: null
    });

    const res = await request(app)
      .get(`/display/chat-image/r1/${photoId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(302);

    expect(res.headers.location).toContain(displayPath);
    expect(storageApi.download).not.toHaveBeenCalled();
    expect(convertHeicToJpegBuffer).not.toHaveBeenCalled();

    await db('photos').where({ id: photoId }).delete();
  });

  test('GET /display/chat-image/:roomId/:photoId?raw=1 streams bytes for non-HEIC (bypasses redirect)', async () => {
    const filename = `chat-nonheic-raw-${uniqueSuffix()}.jpg`;
    const storagePath = `working/${filename}`;

    const photoId = await insertPhotoAndGetId(db, {
      user_id: CHAT_SENDER_USER_ID,
      filename,
      state: 'working',
      hash: `h-${filename}`,
      file_size: 123,
      metadata: '{}',
      storage_path: storagePath,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    supabase.from.mockImplementation((table) => {
      if (table === 'room_members') {
        return makeMaybeSingle({ data: { user_id: TEST_USER_ID }, error: null });
      }
      if (table === 'messages') {
        return makeMessageQuery({
          data: { id: 'm-raw', room_id: 'r1', sender_id: CHAT_SENDER_USER_ID, photo_id: String(photoId), created_at: new Date().toISOString() },
          error: null
        });
      }
      throw new Error(`Unexpected supabase table: ${table}`);
    });

    storageApi.createSignedUrl.mockResolvedValue({
      data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/photos/${storagePath}?token=fake` },
      error: null
    });

    storageApi.download.mockResolvedValue({
      data: new Blob([Buffer.from('fake-jpg-bytes')]),
      error: null
    });

    const res = await request(app)
      .get(`/display/chat-image/r1/${photoId}?raw=1`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(storageApi.download).toHaveBeenCalled();
    expect(storageApi.createSignedUrl).not.toHaveBeenCalled();
    expect(convertHeicToJpegBuffer).not.toHaveBeenCalled();

    await db('photos').where({ id: photoId }).delete();
  });
});
