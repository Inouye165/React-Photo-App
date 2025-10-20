import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock window.location for relative URL tests
Object.defineProperty(window, 'location', {
  value: {
    origin: 'http://localhost:5173'
  },
  writable: true
});

// Mock URL constructor for older environments
global.URL = URL || function(url) {
  const parser = document.createElement('a');
  parser.href = url;
  
  return {
    searchParams: {
      set: function(key, value) {
        const params = new URLSearchParams(parser.search);
        params.set(key, value);
        parser.search = params.toString();
      }
    },
    toString: function() {
      return parser.href;
    }
  };
};

// Import the utility functions
import { createAuthenticatedImageUrl } from '../utils/auth.js';

describe('Frontend Authentication Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  describe('createAuthenticatedImageUrl', () => {
    test('should return original URL when no token exists', () => {
      localStorageMock.getItem.mockReturnValue(null);
      
      const result = createAuthenticatedImageUrl('http://localhost:3001/display/working/test.jpg');
      
      expect(result).toBe('http://localhost:3001/display/working/test.jpg');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('authToken');
    });

    test('should add token as query parameter when token exists', () => {
      const testToken = 'test-jwt-token-12345';
      localStorageMock.getItem.mockReturnValue(testToken);
      
      const result = createAuthenticatedImageUrl('http://localhost:3001/display/working/test.jpg');
      
      expect(result).toBe('http://localhost:3001/display/working/test.jpg?token=test-jwt-token-12345');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('authToken');
    });

    test('should preserve existing query parameters', () => {
      const testToken = 'test-jwt-token-12345';
      localStorageMock.getItem.mockReturnValue(testToken);
      
      const result = createAuthenticatedImageUrl('http://localhost:3001/display/working/test.jpg?existing=param');
      
      expect(result).toContain('existing=param');
      expect(result).toContain('token=test-jwt-token-12345');
    });

    test('should handle relative URLs', () => {
      const testToken = 'test-jwt-token-12345';
      localStorageMock.getItem.mockReturnValue(testToken);
      
      const result = createAuthenticatedImageUrl('/display/working/test.jpg');
      
      expect(result).toContain('token=test-jwt-token-12345');
    });

    test('should handle URLs with fragments', () => {
      const testToken = 'test-jwt-token-12345';
      localStorageMock.getItem.mockReturnValue(testToken);
      
      const result = createAuthenticatedImageUrl('http://localhost:3001/display/working/test.jpg#section');
      
      expect(result).toContain('token=test-jwt-token-12345');
      expect(result).toContain('#section');
    });

    test('should URL encode special characters in token', () => {
      const testToken = 'test-token-with-special-chars+/=';
      localStorageMock.getItem.mockReturnValue(testToken);
      
      const result = createAuthenticatedImageUrl('http://localhost:3001/display/working/test.jpg');
      
      expect(result).toContain('token=');
      expect(result).not.toContain('test-token-with-special-chars+/='); // Should be encoded
    });

    test('should handle empty token gracefully', () => {
      localStorageMock.getItem.mockReturnValue('');
      
      const result = createAuthenticatedImageUrl('http://localhost:3001/display/working/test.jpg');
      
      expect(result).toBe('http://localhost:3001/display/working/test.jpg');
    });

    test('should handle whitespace-only token', () => {
      localStorageMock.getItem.mockReturnValue('   ');
      
      const result = createAuthenticatedImageUrl('http://localhost:3001/display/working/test.jpg');
      
      expect(result).toBe('http://localhost:3001/display/working/test.jpg');
    });

    test('should work with different image states', () => {
      const testToken = 'test-jwt-token';
      localStorageMock.getItem.mockReturnValue(testToken);
      
      const states = ['working', 'inprogress', 'finished'];
      
      states.forEach(state => {
        const result = createAuthenticatedImageUrl(`http://localhost:3001/display/${state}/test.jpg`);
        expect(result).toContain(`display/${state}/test.jpg`);
        expect(result).toContain('token=test-jwt-token');
      });
    });

    test('should work with thumbnail URLs', () => {
      const testToken = 'test-jwt-token';
      localStorageMock.getItem.mockReturnValue(testToken);
      
      const result = createAuthenticatedImageUrl('http://localhost:3001/thumbnails/abc123.jpg');
      
      expect(result).toContain('thumbnails/abc123.jpg');
      expect(result).toContain('token=test-jwt-token');
    });
  });

  describe('Error Handling', () => {
    test('should handle localStorage errors gracefully', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage is not available');
      });
      
      const result = createAuthenticatedImageUrl('http://localhost:3001/display/working/test.jpg');
      
      expect(result).toBe('http://localhost:3001/display/working/test.jpg');
    });

    test('should handle malformed URLs gracefully', () => {
      const testToken = 'test-jwt-token';
      localStorageMock.getItem.mockReturnValue(testToken);
      
      // This should either work or fail gracefully without crashing
      expect(() => {
        createAuthenticatedImageUrl('not-a-valid-url');
      }).not.toThrow();
    });

    test('should handle very long tokens', () => {
      const longToken = 'a'.repeat(10000);
      localStorageMock.getItem.mockReturnValue(longToken);
      
      const result = createAuthenticatedImageUrl('http://localhost:3001/display/working/test.jpg');
      
      expect(result).toContain('token=');
      expect(result.length).toBeGreaterThan(10000);
    });

    test('should handle special URL schemes', () => {
      const testToken = 'test-jwt-token';
      localStorageMock.getItem.mockReturnValue(testToken);
      
      // Test with different schemes
      const schemes = ['http:', 'https:', 'data:', 'blob:'];
      
      schemes.forEach(scheme => {
        if (scheme === 'http:' || scheme === 'https:') {
          const result = createAuthenticatedImageUrl(`${scheme}//localhost:3001/display/working/test.jpg`);
          expect(result).toContain('token=test-jwt-token');
        }
      });
    });
  });

  describe('Security Considerations', () => {
    test('should not expose token in function name or obvious patterns', () => {
      const testToken = 'secret-token-12345';
      localStorageMock.getItem.mockReturnValue(testToken);
      
      const result = createAuthenticatedImageUrl('http://localhost:3001/display/working/test.jpg');
      
      // Token should be in query parameter, not exposed elsewhere
      expect(result).toContain('token=secret-token-12345');
      expect(result.split('token=')[0]).not.toContain('secret-token-12345');
    });

    test('should handle tokens with potentially dangerous characters', () => {
      const dangerousToken = 'token&param=value;rm -rf /';
      localStorageMock.getItem.mockReturnValue(dangerousToken);
      
      const result = createAuthenticatedImageUrl('http://localhost:3001/display/working/test.jpg');
      
      // Should be properly URL encoded
      expect(result).toContain('token=');
      expect(result).not.toContain('rm -rf /');
    });

    test('should not modify original URL object', () => {
      const testToken = 'test-jwt-token';
      localStorageMock.getItem.mockReturnValue(testToken);
      
      const originalUrl = 'http://localhost:3001/display/working/test.jpg';
      const result = createAuthenticatedImageUrl(originalUrl);
      
      expect(originalUrl).toBe('http://localhost:3001/display/working/test.jpg');
      expect(result).not.toBe(originalUrl);
      expect(result).toContain('token=');
    });
  });

  describe('Integration Scenarios', () => {
    test('should work with real JWT token format', () => {
      const realJwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJ0ZXN0IiwiaWF0IjoxNjM5NTAwMDAwfQ.signature';
      localStorageMock.getItem.mockReturnValue(realJwtToken);
      
      const result = createAuthenticatedImageUrl('http://localhost:3001/display/working/test.jpg');
      
      expect(result).toContain(`token=${realJwtToken}`);
    });

    test('should work with typical image file extensions', () => {
      const testToken = 'test-jwt-token';
      localStorageMock.getItem.mockReturnValue(testToken);
      
      const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.bmp', '.webp'];
      
      extensions.forEach(ext => {
        const result = createAuthenticatedImageUrl(`http://localhost:3001/display/working/test${ext}`);
        expect(result).toContain(`test${ext}`);
        expect(result).toContain('token=test-jwt-token');
      });
    });

    test('should work with hash-based thumbnail filenames', () => {
      const testToken = 'test-jwt-token';
      localStorageMock.getItem.mockReturnValue(testToken);
      
      const hashFilename = 'abc123def456789abcdef123456789abcdef123456789abcdef123456789ab.jpg';
      const result = createAuthenticatedImageUrl(`http://localhost:3001/thumbnails/${hashFilename}`);
      
      expect(result).toContain(hashFilename);
      expect(result).toContain('token=test-jwt-token');
    });
  });
});