/**
 * Mock implementation of Supabase client for testing
 * This prevents tests from making actual API calls to Supabase
 */
/* eslint-env jest */

const mockStorageFiles = new Map();
const mockStorageErrors = new Map();
const mockMoveErrors = new Map();

const createMockSupabaseClient = () => {
  return {
  storage: {
  from: (bucket) => ({
        upload: jest.fn().mockImplementation((path, file, options = {}) => {
          const key = `${bucket}/${path}`;
          
          // Check if we should simulate an error
          if (mockStorageErrors.has(key)) {
            return {
              data: null,
              error: mockStorageErrors.get(key)
            };
          }
          
          // Store the file data
          mockStorageFiles.set(key, {
            path,
            file,
            options,
            size: file?.size || file?.length || 1024,
            lastModified: new Date().toISOString()
          });
          
          return {
            data: {
              path,
              id: `mock-id-${Date.now()}`,
              fullPath: `${bucket}/${path}`
            },
            error: null
          };
        }),
        
        download: jest.fn().mockImplementation((path) => {
          const key = `${bucket}/${path}`;
          
          // Check if we should simulate an error
          if (mockStorageErrors.has(key)) {
            return {
              data: null,
              error: mockStorageErrors.get(key)
            };
          }
          
          // Check if file exists
          if (!mockStorageFiles.has(key)) {
            return {
              data: null,
              error: { message: 'File not found', status: 404 }
            };
          }
          
          const fileData = mockStorageFiles.get(key);
          
          // Create mock blob data
          const mockBlob = {
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(fileData.size)),
            size: fileData.size,
            type: 'image/jpeg'
          };
          
          return {
            data: mockBlob,
            error: null
          };
        }),
        
        list: jest.fn().mockImplementation((path = '') => {
          const prefix = `${bucket}/${path}`;
          const files = Array.from(mockStorageFiles.entries())
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, data]) => ({
              name: data.path.split('/').pop(),
              id: `mock-id-${key}`,
              updated_at: data.lastModified,
              created_at: data.lastModified,
              last_accessed_at: data.lastModified,
              metadata: {
                size: data.size,
                mimetype: 'image/jpeg'
              }
            }));
          
          return {
            data: files,
            error: null
          };
        }),
        
        remove: jest.fn().mockImplementation((paths) => {
          const removedPaths = [];
          paths.forEach(path => {
            const key = `${bucket}/${path}`;
            if (mockStorageFiles.has(key)) {
              mockStorageFiles.delete(key);
              removedPaths.push(path);
            }
          });
          
          return {
            data: removedPaths.map(path => ({ name: path })),
            error: null
          };
        })
        ,
        // Simulate move operation
        move: jest.fn().mockImplementation((fromPath, toPath) => {
          const key = `${bucket}/${fromPath}`;

          // If a specific move error is set, return it
          if (mockMoveErrors.has(key)) {
            return { data: null, error: mockMoveErrors.get(key) };
          }

          // If a general storage error is set for the source, return it
          if (mockStorageErrors.has(key)) {
            return { data: null, error: mockStorageErrors.get(key) };
          }

          // If source doesn't exist, return not found
          if (!mockStorageFiles.has(key)) {
            return { data: null, error: { message: 'File not found', status: 404 } };
          }

          // Perform move
          const fileData = mockStorageFiles.get(key);
          const destKey = `${bucket}/${toPath}`;
          mockStorageFiles.set(destKey, { ...fileData, path: toPath });
          mockStorageFiles.delete(key);

          return { data: { moved: true }, error: null };
        })
      })
    }
  };
};

// Helper functions for test setup
const mockStorageHelpers = {
  // Clear all mock data
  clearMockStorage: () => {
    mockStorageFiles.clear();
    mockStorageErrors.clear();
  },
  
  // Add a mock file to storage
  addMockFile: (bucket, path, data = {}) => {
    const key = `${bucket}/${path}`;
    mockStorageFiles.set(key, {
      path,
      size: data.size || 1024,
      lastModified: data.lastModified || new Date().toISOString(),
      ...data
    });
  },
  
  // Set an error for a specific file operation
  setMockError: (bucket, path, error) => {
    const key = `${bucket}/${path}`;
    mockStorageErrors.set(key, error);
  },
  
  // Set an error specifically for move operations (so download/upload can still work)
  setMockMoveError: (bucket, path, error) => {
    const key = `${bucket}/${path}`;
    mockMoveErrors.set(key, error);
  },
  
  // Get all mock files
  getMockFiles: () => Array.from(mockStorageFiles.entries()),
  
  // Check if a file exists in mock storage
  hasMockFile: (bucket, path) => {
    const key = `${bucket}/${path}`;
    return mockStorageFiles.has(key);
  }
};

module.exports = {
  createClient: jest.fn(() => createMockSupabaseClient()),
  mockStorageHelpers
};