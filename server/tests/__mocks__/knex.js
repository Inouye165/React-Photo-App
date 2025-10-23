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
    password_hash: '$2a$10$testhashedpassword',
    role: 'user',
    is_active: true,
    failed_login_attempts: 0,
    account_locked_until: null,
    last_login_attempt: null
  }
];

const createMockQuery = () => {
  const query = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    first: jest.fn(),
    then: jest.fn()
  };

  // Store where conditions for complex queries
  query._whereConditions = {};
  
  // Override where to track conditions
  query.where = jest.fn().mockImplementation((conditions) => {
    if (typeof conditions === 'object') {
      Object.assign(query._whereConditions, conditions);
    }
    return query;
  });

  return query;
};

// Helper to create a per-table query object
const createTableQuery = (table) => {
  const query = createMockQuery();

  // Attach top-level utilities so query can be used as a db instance in some code paths
  query.migrate = mockKnex.migrate;
  query.destroy = mockKnex.destroy;
  query.schema = mockKnex.schema;
  query.raw = mockKnex.raw;

  if (table === 'photos') {
    // then() should pass the filtered rows to the callback
    query.then = jest.fn().mockImplementation((callback) => {
      let photos = Array.from(mockPhotos.values());
      if (Object.keys(query._whereConditions).length > 0) {
        photos = photos.filter(photo => {
          return Object.entries(query._whereConditions).every(([key, value]) => {
            return photo[key] === value;
          });
        });
      }
      return Promise.resolve(callback(photos));
    });

    // first() should respect where conditions
    query.first = jest.fn().mockImplementation(() => {
      let photos = Array.from(mockPhotos.values());
      if (Object.keys(query._whereConditions).length > 0) {
        photos = photos.filter(photo => {
          return Object.entries(query._whereConditions).every(([key, value]) => {
            return photo[key] === value;
          });
        });
      }
      return Promise.resolve(photos[0] || null);
    });

    // insert should enforce unique filename constraint like sqlite
    query.insert = jest.fn().mockImplementation((data) => {
      // If a filename already exists, simulate UNIQUE constraint failure
      if (data && data.filename) {
        const exists = Array.from(mockPhotos.values()).some(p => p.filename === data.filename);
        if (exists) {
          return Promise.reject(new Error('UNIQUE constraint failed: photos.filename'));
        }
      }

      const id = Math.max(...Array.from(mockPhotos.keys()), 0) + 1;
      const photo = { id, ...data };
      mockPhotos.set(id, photo);
      return Promise.resolve([id]);
    });

    query.update = jest.fn().mockImplementation((data) => {
      let updated = 0;
      for (const [id, photo] of Array.from(mockPhotos.entries())) {
        if (Object.keys(query._whereConditions).length > 0) {
          const matches = Object.entries(query._whereConditions).every(([key, value]) => {
            return photo[key] === value;
          });
          if (!matches) continue;
        }
        mockPhotos.set(id, { ...photo, ...data });
        updated++;
      }
      return Promise.resolve(updated);
    });

    query.delete = jest.fn().mockImplementation(() => {
      if (Object.keys(query._whereConditions).length === 0) {
        const count = mockPhotos.size;
        mockPhotos.clear();
        return Promise.resolve(count);
      }
      let deleted = 0;
      for (const [id, photo] of Array.from(mockPhotos.entries())) {
        const matches = Object.entries(query._whereConditions).every(([key, value]) => {
          return photo[key] === value;
        });
        if (matches) {
          mockPhotos.delete(id);
          deleted++;
        }
      }
      return Promise.resolve(deleted);
    });
  }

  if (table === 'users') {
    query.then = jest.fn().mockImplementation((callback) => {
      const users = Array.from(mockUsers.values());
      return Promise.resolve(callback(users));
    });

    query.first = jest.fn().mockImplementation(() => {
      let users = Array.from(mockUsers.values());

      // Apply where conditions if any
      if (Object.keys(query._whereConditions).length > 0) {
        users = users.filter(user => {
          return Object.entries(query._whereConditions).every(([key, value]) => {
            return user[key] === value;
          });
        });
      }

      return Promise.resolve(users[0] || null);
    });

    query.insert = jest.fn().mockImplementation((data) => {
      const id = Math.max(...Array.from(mockUsers.keys()), 0) + 1;
      const user = {
        id,
        role: 'user',
        is_active: true,
        failed_login_attempts: 0,
        account_locked_until: null,
        last_login_attempt: null,
        ...data
      };
      mockUsers.set(id, user);
      return Promise.resolve([id]);
    });

    query.update = jest.fn().mockImplementation((data) => {
      let updatedCount = 0;

      for (const [id, user] of mockUsers.entries()) {
        // Check if this user matches where conditions
        if (Object.keys(query._whereConditions).length > 0) {
          const matches = Object.entries(query._whereConditions).every(([key, value]) => {
            return user[key] === value;
          });

          if (!matches) continue;
        }

        // Handle raw SQL expressions (like failed_login_attempts + 1)
        const updatedData = { ...data };
        if (data.failed_login_attempts && typeof data.failed_login_attempts === 'object' && data.failed_login_attempts.sql) {
          updatedData.failed_login_attempts = (user.failed_login_attempts || 0) + 1;
        }

        mockUsers.set(id, { ...user, ...updatedData });
        updatedCount++;
      }

      return Promise.resolve(updatedCount);
    });

    query.delete = jest.fn().mockImplementation(() => {
      const count = mockUsers.size;
      mockUsers.clear();
      return Promise.resolve(count);
    });
  }

  return query;
};

const mockKnex = jest.fn().mockImplementation((arg) => {
  // If called with a config object (knex(config)), return an instance function that
  // itself can be invoked as db('table'). This mirrors knex usage in tests.
  if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
    const instance = function(table) {
      return createTableQuery(table);
    };

    // Attach utilities on the instance (db.migrate.latest(), db.destroy(), etc.)
    instance.migrate = mockKnex.migrate;
    instance.destroy = mockKnex.destroy;
    instance.schema = mockKnex.schema;
    instance.raw = mockKnex.raw;

    return instance;
  }

  // If called directly with a table name, return a table query
  return createTableQuery(arg);
});

// Add utility methods
mockKnex.raw = jest.fn().mockImplementation((sql) => {
  // Simulate PRAGMA table_info(photos) returning an array of column metadata
  if (typeof sql === 'string' && sql.toUpperCase().includes('PRAGMA TABLE_INFO') && sql.toLowerCase().includes('photos')) {
    // Return simplified column objects with a `name` property as tests expect
    const cols = [
      { cid: 0, name: 'id', type: 'integer' },
      { cid: 1, name: 'filename', type: 'text' },
      { cid: 2, name: 'state', type: 'text' },
      { cid: 3, name: 'metadata', type: 'text' },
      { cid: 4, name: 'hash', type: 'text' },
      { cid: 5, name: 'caption', type: 'text' },
      { cid: 6, name: 'file_size', type: 'integer' }
    ];
    return cols;
  }

  // Default raw behavior - return a simple object synchronously so callers like
  // update({ failed_login_attempts: db.raw('failed_login_attempts + 1') }) can
  // be detected by the mock update implementation.
  return { sql, bindings: [] };
});
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
  
  addMockUser: (user) => {
    const id = Math.max(...Array.from(mockUsers.keys()), 0) + 1;
    const fullUser = { 
      id, 
      role: 'user',
      is_active: true,
      failed_login_attempts: 0,
      account_locked_until: null,
      last_login_attempt: null,
      ...user 
    };
    mockUsers.set(id, fullUser);
    return fullUser;
  },
  
  getMockPhotos: () => Array.from(mockPhotos.values()),
  getMockUsers: () => Array.from(mockUsers.values()),
  
  setMockPhotos: (photos) => {
    mockPhotos.clear();
    photos.forEach(photo => mockPhotos.set(photo.id, photo));
  },
  
  setMockUsers: (users) => {
    mockUsers.clear();
    users.forEach(user => mockUsers.set(user.id, user));
  }
};

module.exports = mockKnex;
module.exports.mockDbHelpers = mockDbHelpers;