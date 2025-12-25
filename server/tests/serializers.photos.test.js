const { mapPhotoRowToListDto, mapPhotoRowToDetailDto } = require('../serializers/photos');

describe('serializers/photos mappers', () => {
  test('mapPhotoRowToListDto produces stable shape and parses JSON-ish fields', () => {
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

    const dto = mapPhotoRowToListDto(row, {
      signThumbnailUrl: () => ({ sig: 'sig', exp: 123456 }),
      ttlSeconds: 900,
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
        classification: 'scenery',
      })
    );

    expect(dto.thumbnail).toContain('/display/thumbnails/h123.jpg');
    expect(dto.thumbnail).toContain('sig=');
    expect(dto.thumbnail).toContain('exp=');
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

    const dto = mapPhotoRowToDetailDto(row);

    expect(dto.metadata).toEqual({});
    expect(dto.textStyle).toEqual({ size: 12 });
    expect(dto.poi_analysis).toEqual({ x: 1 });
    expect(dto.aiModelHistory).toBeNull();
    expect(dto.url).toBe('/display/image/5');
    expect(dto.thumbnail).toBeNull();
  });
});
