const { normalizePOICategory, performVisionMatching } = require('../ai/langchain/photoPOIIdentifier');

describe('photoPOIIdentifier Helpers', () => {
  describe('performVisionMatching', () => {
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

    test('matches keyword from search_keywords to poi visual_keywords', () => {
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

  describe('normalizePOICategory', () => {
    it('should normalize restaurant tags', () => {
      expect(normalizePOICategory({ amenity: 'restaurant' })).toBe('restaurant');
      expect(normalizePOICategory({ amenity: 'cafe' })).toBe('restaurant');
      expect(normalizePOICategory({ amenity: 'fast_food' })).toBe('restaurant');
      expect(normalizePOICategory({ amenity: 'bar' })).toBe('restaurant');
    });

    it('should normalize store tags', () => {
      expect(normalizePOICategory({ shop: 'supermarket' })).toBe('store');
      expect(normalizePOICategory({ shop: 'convenience' })).toBe('store');
    });

    it('should normalize park tags', () => {
      expect(normalizePOICategory({ leisure: 'park' })).toBe('park');
      expect(normalizePOICategory({ leisure: 'nature_reserve' })).toBe('park');
    });

    it('should normalize landmark tags', () => {
      expect(normalizePOICategory({ tourism: 'museum' })).toBe('landmark');
      expect(normalizePOICategory({ tourism: 'viewpoint' })).toBe('landmark');
    });

    it('should normalize natural_landmark tags', () => {
      expect(normalizePOICategory({ natural: 'peak' })).toBe('natural_landmark');
      expect(normalizePOICategory({ natural: 'beach' })).toBe('natural_landmark');
    });

    it('should handle expanded restaurant tags', () => {
      expect(normalizePOICategory({ amenity: 'pub' })).toBe('restaurant');
    });

    it('should handle expanded park tags', () => {
      expect(normalizePOICategory({ leisure: 'garden' })).toBe('park');
      expect(normalizePOICategory({ leisure: 'fitness_centre' })).toBe('park');
    });

    it('should handle expanded landmark tags (tourism)', () => {
      expect(normalizePOICategory({ tourism: 'gallery' })).toBe('landmark');
      expect(normalizePOICategory({ tourism: 'hotel' })).toBe('landmark');
    });

    it('should handle historic landmark tags', () => {
      expect(normalizePOICategory({ historic: 'monument' })).toBe('landmark');
      expect(normalizePOICategory({ historic: 'castle' })).toBe('landmark');
      expect(normalizePOICategory({ historic: 'ruins' })).toBe('landmark');
      // This one should have returned 'poi' before
      expect(normalizePOICategory({ historic: 'castle' })).not.toBe('poi');
    });

    it('should handle expanded natural_landmark tags', () => {
      expect(normalizePOICategory({ natural: 'geyser' })).toBe('natural_landmark');
      expect(normalizePOICategory({ natural: 'hot_spring' })).toBe('natural_landmark');
    });

    it('should return "poi" as default', () => {
      expect(normalizePOICategory({})).toBe('poi');
      expect(normalizePOICategory(null)).toBe('poi');
    });
  });
});
