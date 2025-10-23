/**
 * Mock implementation of database connection for testing
 */
/* eslint-env jest */

const mockPhotos = new Map();
const mockUsers = new Map();

// Default test data
const defaultPhotos = [
  {
    id: 1,
    filename: 'test1.jpg',
    state: 'working',
    hash: 'abc123',
    storage_path: 'working/test1.jpg',
    file_size: 1024000,
    metadata: { DateTimeOriginal: '2024-01-01 12:00:00' }
  },
  {
    id: 2,
    filename: 'test2.jpg',
    state: 'inprogress',
    hash: 'def456',
    storage_path: 'inprogress/test2.jpg',
    file_size: 2048000,
    metadata: { DateTimeOriginal: '2024-01-02 12:00:00' }
  }
];

const defaultUsers = [
  {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    password_hash: '$2a$10$testhashedpassword'
  }
];

const createMockQuery = () => {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    first: jest.fn().mockImplementation(() => {
      const photos = Array.from(mockPhotos.values());
      return Promise.resolve(photos[0] || null);
    }),
    then: jest.fn().mockImplementation((callback) => {
      const photos = Array.from(mockPhotos.values());
      return Promise.resolve(callback(photos));
    })
  };
};

const mockKnex = jest.fn().mockImplementation((table) => {
  const query = createMockQuery();
  
  if (table === 'photos') {
    query.then = jest.fn().mockImplementation((callback) => {
      const photos = Array.from(mockPhotos.values());
      return Promise.resolve(callback(photos));
    });
    
    query.first = jest.fn().mockImplementation(() => {
      const photos = Array.from(mockPhotos.values());
      return Promise.resolve(photos[0] || null);
    });
    
    query.insert = jest.fn().mockImplementation((data) => {
      const id = Math.max(...Array.from(mockPhotos.keys()), 0) + 1;
      const photo = { id, ...data };
      mockPhotos.set(id, photo);
      return Promise.resolve([id]);
    });
    
    query.update = jest.fn().mockImplementation((data) => {
      for (const [id, photo] of mockPhotos.entries()) {
        mockPhotos.set(id, { ...photo, ...data });
      }
      return Promise.resolve(1);
    });
    
    query.delete = jest.fn().mockImplementation(() => {
      const count = mockPhotos.size;
      mockPhotos.clear();
      return Promise.resolve(count);
    });
  }
  
  if (table === 'users') {
    query.then = jest.fn().mockImplementation((callback) => {
      const users = Array.from(mockUsers.values());
      return Promise.resolve(callback(users));
    });
    
    query.first = jest.fn().mockImplementation(() => {
      const users = Array.from(mockUsers.values());
      return Promise.resolve(users[0] || null);
    });
  }
  
  return query;
});

// Add utility methods
mockKnex.raw = jest.fn().mockResolvedValue({ rows: [] });
mockKnex.migrate = {
  latest: jest.fn().mockResolvedValue([1, ['test_migration']]),
  rollback: jest.fn().mockResolvedValue([1, ['test_migration']]),
  currentVersion: jest.fn().mockResolvedValue('001')
};
mockKnex.schema = {
  hasTable: jest.fn().mockResolvedValue(true),
  createTable: jest.fn().mockResolvedValue(true),
  dropTable: jest.fn().mockResolvedValue(true)
};
mockKnex.destroy = jest.fn().mockResolvedValue(true);

const mockDbHelpers = {
  clearMockData: () => {
    mockPhotos.clear();
    mockUsers.clear();
  },
  
  loadDefaultData: () => {
    mockPhotos.clear();
    mockUsers.clear();
    
    defaultPhotos.forEach(photo => {
      mockPhotos.set(photo.id, { ...photo });
    });
    
    defaultUsers.forEach(user => {
      mockUsers.set(user.id, { ...user });
    });
  },
  
  addMockPhoto: (photo) => {
    const id = Math.max(...Array.from(mockPhotos.keys()), 0) + 1;
    const fullPhoto = { id, ...photo };
    mockPhotos.set(id, fullPhoto);
    return fullPhoto;
  },
  
  getMockPhotos: () => Array.from(mockPhotos.values()),
  getMockUsers: () => Array.from(mockUsers.values()),
  
  setMockPhotos: (photos) => {
    mockPhotos.clear();
    photos.forEach(photo => mockPhotos.set(photo.id, photo));
  }
};

module.exports = mockKnex;
module.exports.mockDbHelpers = mockDbHelpers;