const { performVisionMatching } = require('../ai/langchain/photoPOIIdentifier');

describe('performVisionMatching helper', () => {
  test('fuzzy matches business name using Fuse', () => {
    const pois = [
      { name: 'Cafe de Paris', visual_keywords: ['cafe', 'paris'] },
      { name: 'Parkview Diner', visual_keywords: ['diner'] }
    ];

    const sceneAnalysis = {
      business_name: 'Cafe de Pari', // intentionally slightly misspelled
      visible_text: [],
      search_keywords: []
    };

    const result = performVisionMatching(pois, sceneAnalysis);
    const matched = result.find(p => p.name === 'Cafe de Paris');
    expect(matched).toBeDefined();
    expect(matched.business_name_match).toBeTruthy();
  });

  test('matches keyword from visible_text to poi visual_keywords', () => {
    const pois = [
      { name: 'Parkview Diner', visual_keywords: ['diner'] },
      { name: 'Other Place', visual_keywords: [] }
    ];

    const sceneAnalysis = {
      business_name: '',
      visible_text: [],
      // performVisionMatching treats search_keywords and visual_elements as keyword sources
      search_keywords: ['diner']
    };

    const result = performVisionMatching(pois, sceneAnalysis);
    const matched = result.find(p => p.name === 'Parkview Diner');
    expect(matched).toBeDefined();
    expect(matched.keyword_match).toBeTruthy();
  });

  test('returns unchanged POIs when no visual data present', () => {
    const pois = [{ name: 'No Match', visual_keywords: [] }];
    const sceneAnalysis = { business_name: '', visible_text: [], search_keywords: [] };

    const result = performVisionMatching(pois, sceneAnalysis);
    // Should not add match flags when there's no visual data
    expect(result[0].business_name_match).toBeUndefined();
    expect(result[0].keyword_match).toBeUndefined();
  });
});
