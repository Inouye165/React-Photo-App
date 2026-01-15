const { mapPhotoRowToListDto, mapPhotoRowToDetailDto } = require('../serializers/photos');

describe('serializers/photos mappers', () => {
  test('mapPhotoRowToListDto produces stable shape and parses JSON-ish fields', async () => {
    const row = {
      id: 123,
      filename: 'a.jpg',
      state: 'finished',
      metadata: '{"width":800}',
      hash: 'h123',
      file_size: 10,
      caption: null,
      description: null,
      keywords: null,
      text_style: '{"font":"Arial"}',
      ai_model_history: '{"models":["gpt-5"]}',
      poi_analysis: '{"name":"Test POI","confidence":0.95}',
      edited_filename: null,
      storage_path: null,
      classification: 'scenery',
    };

    const dto = await mapPhotoRowToListDto(row, {
      ttlSeconds: 3600,
      signThumbnailUrl: () => ({ sig: 'testsig', exp: 123 }),
    });

    expect(dto).toEqual(
      expect.objectContaining({
        id: 123,
        filename: 'a.jpg',
        state: 'finished',
        metadata: { width: 800 },
        hash: 'h123',
        file_size: 10,
        textStyle: { font: 'Arial' },
        aiModelHistory: { models: ['gpt-5'] },
        poi_analysis: { name: 'Test POI', confidence: 0.95 },
        url: '/display/image/123',
        originalUrl: '/photos/123/original',
        classification: 'scenery',
      })
    );

    expect(dto.thumbnail).toBe('/display/thumbnails/h123.jpg?sig=testsig&exp=123');
    expect(dto.thumbnailUrl).toBe('/display/thumbnails/h123.jpg?sig=testsig&exp=123');
    expect(dto.smallThumbnail).toBe('/display/thumbnails/h123.jpg?sig=testsig&exp=123');
    expect(dto.smallThumbnailUrl).toBe('/display/thumbnails/h123.jpg?sig=testsig&exp=123');
  });

  test('mapPhotoRowToListDto returns signed smallThumbnail when thumb_small_path exists', async () => {
    const row = {
      id: 7,
      filename: 'a.jpg',
      state: 'finished',
      metadata: '{}',
      hash: 'h7',
      thumb_path: 'thumbnails/h7.jpg',
      thumb_small_path: 'thumbnails/h7-sm.jpg',
    };

    const dto = await mapPhotoRowToListDto(row, {
      ttlSeconds: 3600,
      signThumbnailUrl: () => ({ sig: 'testsig', exp: 123 }),
    });

    expect(dto.thumbnail).toBe('/display/thumbnails/h7.jpg?sig=testsig&exp=123');
    expect(dto.smallThumbnail).toBe('/display/thumbnails/h7-sm.jpg?sig=testsig&exp=123');
    expect(dto.thumbnailUrl).toBe('/display/thumbnails/h7.jpg?sig=testsig&exp=123');
    expect(dto.smallThumbnailUrl).toBe('/display/thumbnails/h7-sm.jpg?sig=testsig&exp=123');
  });

  test('mapPhotoRowToDetailDto preserves metadata default {} and parses JSON-ish fields', () => {
    const row = {
      id: 5,
      filename: 'b.jpg',
      state: 'working',
      metadata: '',
      hash: null,
      file_size: 1,
      caption: 'c',
      description: 'd',
      keywords: 'k',
      text_style: '{"size":12}',
      ai_model_history: null,
      poi_analysis: '{"x":1}',
      edited_filename: 'b-edit.jpg',
      storage_path: 'inprogress/b-edit.jpg',
      classification: 'scenery',
    };

    const dto = mapPhotoRowToDetailDto(row, {
      ttlSeconds: 3600,
      signThumbnailUrl: () => ({ sig: 'testsig', exp: 123 }),
    });

    expect(dto.metadata).toEqual({});
    expect(dto.textStyle).toEqual({ size: 12 });
    expect(dto.poi_analysis).toEqual({ x: 1 });
    expect(dto.aiModelHistory).toBeNull();
    expect(dto.url).toBe('/display/image/5');
    expect(dto.fullUrl).toBe('/display/image/5');
    expect(dto.originalUrl).toBe('/photos/5/original');
    expect(dto.thumbnail).toBeNull();
    expect(dto.thumbnailUrl).toBeNull();
    expect(dto.smallThumbnailUrl).toBeNull();
  });
});
