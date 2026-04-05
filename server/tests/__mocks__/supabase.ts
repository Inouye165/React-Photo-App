/**
 * Mock implementation of Supabase client for testing
 * This prevents tests from making actual API calls to Supabase
 */
/* eslint-env jest */

interface StorageFileData {
  path: string;
  file?: string;
  options?: Record<string, unknown>;
  size: number;
  lastModified: string;
  [key: string]: unknown;
}

interface StorageError {
  message: string;
  status: number;
}

interface MockSupabaseClient {
  auth: {
    getUser: jest.Mock;
  };
  storage: {
    from: (bucket: string) => {
      upload: jest.Mock;
      setAlwaysErrorOnUpload: (val: boolean) => void;
      download: jest.Mock;
      list: jest.Mock;
      remove: jest.Mock;
      move: jest.Mock;
    };
  };
}

const mockStorageFiles = new Map<string, StorageFileData>();
const mockStorageErrors = new Map<string, StorageError>();
const mockMoveErrors = new Map<string, StorageError>();
let alwaysErrorOnUpload = false;

// Shared auth mock
const mockGetUser: jest.Mock = jest.fn().mockResolvedValue({
  data: { user: { id: 1, email: 'test@example.com' } },
  error: null
});

const createMockSupabaseClient = (): MockSupabaseClient => {
  return {
    auth: {
      getUser: mockGetUser
    },
    storage: {
      from: (bucket: string) => ({
        upload: jest.fn().mockImplementation(async (path: string, file: unknown, options: Record<string, unknown> = {}) => {
          const key = `${bucket}/${path}`;
          // Always error if flag is set
          if (alwaysErrorOnUpload) {
            // If file is a stream, consume it before returning error
            if (file && typeof (file as NodeJS.ReadableStream).on === 'function') {
              (file as NodeJS.ReadableStream).resume();
              await new Promise<void>((resolve) => {
                (file as NodeJS.ReadableStream).on('end', resolve);
                (file as NodeJS.ReadableStream).on('error', resolve);
              });
            }
            return {
              data: null,
              error: { message: 'Storage unavailable', status: 500 }
            };
          }
          // Check if we should simulate an error
          if (mockStorageErrors.has(key)) {
            // If file is a stream, consume it before returning error
            if (file && typeof (file as NodeJS.ReadableStream).on === 'function') {
              (file as NodeJS.ReadableStream).resume();
              await new Promise<void>((resolve) => {
                (file as NodeJS.ReadableStream).on('end', resolve);
                (file as NodeJS.ReadableStream).on('error', resolve);
              });
            }
            return {
              data: null,
              error: mockStorageErrors.get(key)
            };
          }
          
          // If file is a stream, we need to consume it to prevent ECONNRESET
          let fileSize: number = (file as { size?: number; length?: number })?.size || (file as { size?: number; length?: number })?.length || 1024;
          if (file && typeof (file as NodeJS.ReadableStream).on === 'function') {
            // It's a stream - consume it with better error handling
            const chunks: Buffer[] = [];
            let streamError: Error | null = null;
            
            (file as NodeJS.ReadableStream).on('data', (chunk: Buffer) => chunks.push(chunk));
            (file as NodeJS.ReadableStream).on('error', (err: Error) => { streamError = err; });
            
            // Wait for stream to finish with timeout to prevent hanging
            await Promise.race([
              new Promise<void>((resolve, reject) => {
                (file as NodeJS.ReadableStream).on('end', resolve);
                (file as NodeJS.ReadableStream).on('close', resolve); // Also listen for close event
                (file as NodeJS.ReadableStream).on('error', reject);
              }),
              new Promise<void>((resolve) => setTimeout(resolve, 1000)) // 1s timeout
            ]);
            
            if (streamError) {
              // Stream had an error but we consumed it, return success anyway
              // This prevents ECONNRESET from bubbling up
              fileSize = 0;
            } else {
              fileSize = chunks.length > 0 ? Buffer.concat(chunks).length : 0;
            }
          }
          
          // Store the file data
          mockStorageFiles.set(key, {
            path,
            file: 'mock-consumed-stream',
            options,
            size: fileSize,
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
          // Set global upload error flag
          setAlwaysErrorOnUpload: (val: boolean): void => { alwaysErrorOnUpload = val; },
        
        download: jest.fn().mockImplementation((path: string) => {
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
          
          const fileData: StorageFileData = mockStorageFiles.get(key)!;
          
          // Create mock blob data with stream support
          const mockBlob = {
            arrayBuffer: (): Promise<ArrayBuffer> => Promise.resolve(new ArrayBuffer(fileData.size)),
            stream: (): NodeJS.ReadableStream => {
              // Return a Web ReadableStream (compatible with Readable.from)
              const { Readable } = require('stream');
              // Create a simple stream that emits mock data
              return Readable.from([Buffer.alloc(fileData.size)]);
            },
            size: fileData.size,
            type: 'image/jpeg'
          };
          
          return {
            data: mockBlob,
            error: null
          };
        }),
        
        list: jest.fn().mockImplementation((path: string = '') => {
          const prefix = `${bucket}/${path}`;
          const files = Array.from(mockStorageFiles.entries())
            .filter(([key]: [string, StorageFileData]) => key.startsWith(prefix))
            .map(([_key, data]: [string, StorageFileData]) => ({
              name: data.path.split('/').pop(),
              id: `mock-id-${_key}`,
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
        
        remove: jest.fn().mockImplementation((paths: string[]) => {
          const removedPaths: string[] = [];
          paths.forEach((path: string) => {
            const key = `${bucket}/${path}`;
            if (mockStorageFiles.has(key)) {
              mockStorageFiles.delete(key);
              removedPaths.push(path);
            }
          });
          
          return {
            data: removedPaths.map((path: string) => ({ name: path })),
            error: null
          };
        }),
        // Simulate move operation
        move: jest.fn().mockImplementation((fromPath: string, toPath: string) => {
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
          const fileData: StorageFileData = mockStorageFiles.get(key)!;
          const destKey = `${bucket}/${toPath}`;
          mockStorageFiles.set(destKey, { ...fileData, path: toPath });
          mockStorageFiles.delete(key);

          return { data: { moved: true }, error: null };
        })
      })
    }
  };
};

interface MockStorageHelpers {
  clearMockStorage: () => void;
  addMockFile: (bucket: string, path: string, data?: Partial<StorageFileData>) => void;
  setMockError: (bucket: string, path: string, error: StorageError) => void;
  setMockMoveError: (bucket: string, path: string, error: StorageError) => void;
  getMockFiles: () => [string, StorageFileData][];
  hasMockFile: (bucket: string, path: string) => boolean;
  setAlwaysErrorOnUpload: (val: boolean) => void;
}

// Helper functions for test setup
const mockStorageHelpers: MockStorageHelpers = {
  // Clear all mock data
  clearMockStorage: (): void => {
    mockStorageFiles.clear();
    mockStorageErrors.clear();
  },
  
  // Add a mock file to storage
  addMockFile: (bucket: string, path: string, data: Partial<StorageFileData> = {}): void => {
    const key = `${bucket}/${path}`;
    mockStorageFiles.set(key, {
      path,
      size: data.size || 1024,
      lastModified: data.lastModified || new Date().toISOString(),
      ...data
    });
  },
  
  // Set an error for a specific file operation
  setMockError: (bucket: string, path: string, error: StorageError): void => {
    const key = `${bucket}/${path}`;
    mockStorageErrors.set(key, error);
  },
  
  // Set an error specifically for move operations (so download/upload can still work)
  setMockMoveError: (bucket: string, path: string, error: StorageError): void => {
    const key = `${bucket}/${path}`;
    mockMoveErrors.set(key, error);
  },
  
  // Get all mock files
  getMockFiles: (): [string, StorageFileData][] => Array.from(mockStorageFiles.entries()),

  // Check if a file exists in mock storage
  hasMockFile: (bucket: string, path: string): boolean => {
    const key = `${bucket}/${path}`;
    return mockStorageFiles.has(key);
  },

  // Set global upload error flag
  setAlwaysErrorOnUpload: (val: boolean): void => { alwaysErrorOnUpload = val; }
};

module.exports = {
  createClient: jest.fn(() => createMockSupabaseClient()),
  mockStorageHelpers,
  __mockGetUser: mockGetUser
};
