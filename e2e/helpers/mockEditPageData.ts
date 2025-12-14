/**
 * Mock data helpers for EditPage visual regression tests
 * Provides deterministic test data without requiring backend/DB
 */

export const mockBasePhoto = {
  id: 999, // Must match route param in tests
  user_id: '11111111-1111-4111-8111-111111111111',
  url: '/api/photos/999/blob',
  thumbnail: '/api/photos/999/thumb',
  caption: 'Visual Test Photo',
  description: 'A comprehensive test photo for visual regression testing of the EditPage component.',
  keywords: 'test, visual, regression, playwright',
  filename: 'test-photo.jpg',
  latitude: 37.7749,
  longitude: -122.4194,
  location_name: 'San Francisco, CA',
  hash: 'test-hash-abc123',
  updated_at: '2025-12-14T00:00:00Z',
  created_at: '2025-12-14T00:00:00Z',
  classification: 'general',
  ai_status: 'completed',
  ai_analysis: {
    classification: 'general',
    description: 'AI-generated test description'
  }
};

export const mockCollectiblePhoto = {
  ...mockBasePhoto,
  id: 1000,
  url: '/api/photos/1000/blob',
  thumbnail: '/api/photos/1000/thumb',
  classification: 'collectables',
  ai_analysis: {
    classification: 'collectables',
    collectibleInsights: {
      category: 'vintage-toys',
      estimatedValue: { min: 50, max: 150 },
      condition: 'good',
      rarity: 'medium'
    }
  },
  poi_analysis: {
    category: 'vintage-toys',
    name: 'Vintage Action Figure 1985',
    conditionLabel: 'Good',
    valueMin: 50,
    valueMax: 150,
    rarity: 'medium'
  }
};

export const mockUser = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'visual-test-user',
  role: 'admin',
  email: 'visual-test@example.com'
};

export const mockCollectibleData = {
  id: 1,
  photo_id: 1000,
  category: 'vintage-toys',
  name: 'Vintage Action Figure 1985',
  conditionLabel: 'Good',
  valueMin: 50,
  valueMax: 150,
  specifics: {
    manufacturer: 'Test Toy Co.',
    year: '1985',
    series: 'Classic Heroes'
  },
  created_at: '2025-12-14T00:00:00Z',
  updated_at: '2025-12-14T00:00:00Z'
};

/**
 * 1x1 transparent PNG (tiny base64-encoded image for mock blob responses)
 */
export const MOCK_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export function getMockImageBuffer(): Buffer {
  return Buffer.from(MOCK_IMAGE_BASE64, 'base64');
}
