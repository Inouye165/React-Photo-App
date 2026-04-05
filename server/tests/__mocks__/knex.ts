/**
 * Mock implementation of database connection for testing
 */
/* eslint-env jest */

interface PhotoRecord {
  id: number;
  user_id?: number;
  filename?: string;
  state?: string;
  hash?: string;
  storage_path?: string;
  file_size?: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface UserRecord {
  id: number;
  username?: string;
  email?: string;
  password_hash?: string;
  role?: string;
  is_active?: boolean;
  failed_login_attempts?: number;
  account_locked_until?: string | null;
  last_login_attempt?: string | null;
  [key: string]: unknown;
}

interface MockQuery {
  select: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orWhere: jest.Mock;
  whereIn: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  timeout: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  returning: jest.Mock;
  first: jest.Mock;
  then: jest.Mock;
  _whereConditions: Record<string, unknown>;
  _whereInConditions: Record<string, unknown[]>;
  migrate?: typeof mockKnex.migrate;
  destroy?: typeof mockKnex.destroy;
  schema?: typeof mockKnex.schema;
  raw?: typeof mockKnex.raw;
}

const mockPhotos = new Map<number, PhotoRecord>();
const mockUsers = new Map<number, UserRecord>();

// Default test data
const defaultPhotos: PhotoRecord[] = [
  {
    id: 1,
    user_id: 1,
    filename: 'test1.jpg',
    state: 'working',
    hash: 'abc123',
    storage_path: 'working/test1.jpg',
    file_size: 1024000,
    metadata: { DateTimeOriginal: '2024-01-01 12:00:00' }
  },
  {
    id: 2,
    user_id: 1,
    filename: 'test2.jpg',
    state: 'inprogress',
    hash: 'def456',
    storage_path: 'inprogress/test2.jpg',
    file_size: 2048000,
    metadata: { DateTimeOriginal: '2024-01-02 12:00:00' }
  }
];

const defaultUsers: UserRecord[] = [
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

const createMockQuery = (): MockQuery => {
  const query: MockQuery = {
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    timeout: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    first: jest.fn(),
    then: jest.fn(),
    _whereConditions: {},
    _whereInConditions: {}
  };

  // Override where/andWhere/orWhere to track conditions
  const whereImpl = jest.fn(function (this: MockQuery, ...args: unknown[]): MockQuery {
    // Support both:
    // - where({ id: 1, user_id: 1 })
    // - where('id', 1)
    if (args.length === 1) {
      const conditions = args[0];
      if (conditions && typeof conditions === 'object' && !Array.isArray(conditions)) {
        Object.assign(query._whereConditions, conditions);
      }
      return query;
    }

    const [column, value] = args;
    if (typeof column === 'string') {
      query._whereConditions[column] = value;
    }

    return query;
  });
  query.where = whereImpl;
  query.andWhere = whereImpl;
  query.orWhere = whereImpl;

  // Add whereIn implementation
  query.whereIn = jest.fn(function (column: string, values: unknown[]): MockQuery {
    query._whereInConditions[column] = values;
    return query;
  });

  return query;
};

// Helper to create a per-table query object
const createTableQuery = (table: string): MockQuery => {
  const query: MockQuery = createMockQuery();

  // Attach top-level utilities so query can be used as a db instance in some code paths
  query.migrate = mockKnex.migrate;
  query.destroy = mockKnex.destroy;
  query.schema = mockKnex.schema;
  query.raw = mockKnex.raw;

  if (table === 'photos') {
    // then() should pass the filtered rows to the callback
    query.then = jest.fn().mockImplementation((callback: (rows: PhotoRecord[]) => unknown) => {
      let photos: PhotoRecord[] = Array.from(mockPhotos.values());
      
      // Apply where conditions
      if (Object.keys(query._whereConditions).length > 0) {
        photos = photos.filter((photo: PhotoRecord) => {
          return Object.entries(query._whereConditions).every(([key, value]: [string, unknown]) => {
            const cleanKey: string = key.includes('.') ? key.split('.')[1] : key;
            // Allow loose equality to match numeric DB ids against string params
            return photo[cleanKey] == value;
          });
        });
      }
      
      // Apply whereIn conditions
      if (Object.keys(query._whereInConditions).length > 0) {
        photos = photos.filter((photo: PhotoRecord) => {
          return Object.entries(query._whereInConditions).every(([column, values]: [string, unknown[]]) => {
            return values.includes(photo[column]);
          });
        });
      }
      
      return Promise.resolve(callback(photos));
    });

    // first() should respect where conditions
    query.first = jest.fn().mockImplementation((): Promise<PhotoRecord | null> => {
      let photos: PhotoRecord[] = Array.from(mockPhotos.values());
      
      // Apply where conditions
      if (Object.keys(query._whereConditions).length > 0) {
        photos = photos.filter((photo: PhotoRecord) => {
          return Object.entries(query._whereConditions).every(([key, value]: [string, unknown]) => {
            const cleanKey: string = key.includes('.') ? key.split('.')[1] : key;
            // Allow loose equality to match numeric DB ids against string params
            return photo[cleanKey] == value;
          });
        });
      }
      
      // Apply whereIn conditions
      if (Object.keys(query._whereInConditions).length > 0) {
        photos = photos.filter((photo: PhotoRecord) => {
          return Object.entries(query._whereInConditions).every(([column, values]: [string, unknown[]]) => {
            return values.includes(photo[column]);
          });
        });
      }
      
      return Promise.resolve(photos[0] || null);
    });

    // insert should enforce unique filename constraint like sqlite
    query.insert = jest.fn().mockImplementation((data: Partial<PhotoRecord>) => {
      // If a filename already exists, simulate UNIQUE constraint failure
      if (data && data.filename) {
        const exists: boolean = Array.from(mockPhotos.values()).some((p: PhotoRecord) => p.filename === data.filename);
        if (exists) {
          return Promise.reject(new Error('UNIQUE constraint failed: photos.filename'));
        }
      }

      const id: number = Math.max(...Array.from(mockPhotos.keys()), 0) + 1;
      const photo: PhotoRecord = { id, ...data } as PhotoRecord;
      mockPhotos.set(id, photo);
      return Promise.resolve([id]);
    });

    query.update = jest.fn().mockImplementation((data: Partial<PhotoRecord>) => {
      let updated = 0;
      for (const [id, photo] of Array.from(mockPhotos.entries())) {
        if (Object.keys(query._whereConditions).length > 0) {
          const matches: boolean = Object.entries(query._whereConditions).every(([key, value]: [string, unknown]) => {
            const cleanKey: string = key.includes('.') ? key.split('.')[1] : key;
            // Allow loose equality to match numeric DB ids against string params
            return photo[cleanKey] == value;
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
        const count: number = mockPhotos.size;
        mockPhotos.clear();
        return Promise.resolve(count);
      }
      let deleted = 0;
      for (const [id, photo] of Array.from(mockPhotos.entries())) {
        const matches: boolean = Object.entries(query._whereConditions).every(([key, value]: [string, unknown]) => {
          // Allow loose equality to match numeric DB ids against string params
          return photo[key] == value;
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
    query.then = jest.fn().mockImplementation((callback: (rows: UserRecord[]) => unknown) => {
      const users: UserRecord[] = Array.from(mockUsers.values());
      return Promise.resolve(callback(users));
    });

    query.first = jest.fn().mockImplementation((): Promise<UserRecord | null> => {
      let users: UserRecord[] = Array.from(mockUsers.values());

      // Apply where conditions if any
      if (Object.keys(query._whereConditions).length > 0) {
        users = users.filter((user: UserRecord) => {
          return Object.entries(query._whereConditions).every(([key, value]: [string, unknown]) => {
            // Allow loose equality to match numeric DB ids against string params
            return user[key] == value;
          });
        });
      }

      return Promise.resolve(users[0] || null);
    });

    query.insert = jest.fn().mockImplementation((data: Partial<UserRecord>) => {
      const id: number = Math.max(...Array.from(mockUsers.keys()), 0) + 1;
      const user: UserRecord = {
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

    query.update = jest.fn().mockImplementation((data: Record<string, unknown>) => {
      let updatedCount = 0;

      for (const [id, user] of mockUsers.entries()) {
        // Check if this user matches where conditions
        if (Object.keys(query._whereConditions).length > 0) {
          const matches: boolean = Object.entries(query._whereConditions).every(([key, value]: [string, unknown]) => {
            // Allow loose equality to match numeric DB ids against string params
            return user[key] == value;
          });

          if (!matches) continue;
        }

        // Handle raw SQL expressions (like failed_login_attempts + 1)
        const updatedData: Record<string, unknown> = { ...data };
        if (data.failed_login_attempts && typeof data.failed_login_attempts === 'object' && (data.failed_login_attempts as { sql?: string }).sql) {
          updatedData.failed_login_attempts = ((user.failed_login_attempts as number) || 0) + 1;
        }

        mockUsers.set(id, { ...user, ...updatedData } as UserRecord);
        updatedCount++;
      }

      return Promise.resolve(updatedCount);
    });

    query.delete = jest.fn().mockImplementation(() => {
      const count: number = mockUsers.size;
      mockUsers.clear();
      return Promise.resolve(count);
    });
  }

  return query;
};

const mockKnex = jest.fn().mockImplementation((arg: unknown) => {
  // If called with a config object (knex(config)), return an instance function that
  // itself can be invoked as db('table'). This mirrors knex usage in tests.
  if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
    const instance = function(table: string): MockQuery {
      return createTableQuery(table);
    };

    // Attach utilities on the instance (db.migrate.latest(), db.destroy(), etc.)
    (instance as Record<string, unknown>).migrate = mockKnex.migrate;
    (instance as Record<string, unknown>).destroy = mockKnex.destroy;
    (instance as Record<string, unknown>).schema = mockKnex.schema;
    (instance as Record<string, unknown>).raw = mockKnex.raw;

    return instance;
  }

  // If called directly with a table name, return a table query
  return createTableQuery(arg as string);
}) as jest.Mock & {
  raw: jest.Mock;
  migrate: {
    latest: jest.Mock;
    rollback: jest.Mock;
    currentVersion: jest.Mock;
  };
  schema: {
    hasTable: jest.Mock;
    createTable: jest.Mock;
    dropTable: jest.Mock;
  };
  destroy: jest.Mock;
};

// Add utility methods
mockKnex.raw = jest.fn().mockImplementation((sql: string) => {
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

interface MockDbHelpers {
  clearMockData: () => void;
  loadDefaultData: () => void;
  addMockPhoto: (photo: Partial<PhotoRecord>) => PhotoRecord;
  addMockUser: (user: Partial<UserRecord>) => UserRecord;
  getMockPhotos: () => PhotoRecord[];
  getMockUsers: () => UserRecord[];
  setMockPhotos: (photos: PhotoRecord[]) => void;
  setMockUsers: (users: UserRecord[]) => void;
}

const mockDbHelpers: MockDbHelpers = {
  clearMockData: (): void => {
    mockPhotos.clear();
    mockUsers.clear();
  },
  
  loadDefaultData: (): void => {
    mockPhotos.clear();
    mockUsers.clear();
    
    defaultPhotos.forEach((photo: PhotoRecord) => {
      mockPhotos.set(photo.id, { ...photo });
    });
    
    defaultUsers.forEach((user: UserRecord) => {
      mockUsers.set(user.id, { ...user });
    });
  },
  
  addMockPhoto: (photo: Partial<PhotoRecord>): PhotoRecord => {
    const id: number = Math.max(...Array.from(mockPhotos.keys()), 0) + 1;
    const fullPhoto: PhotoRecord = { id, ...photo } as PhotoRecord;
    mockPhotos.set(id, fullPhoto);
    return fullPhoto;
  },
  
  addMockUser: (user: Partial<UserRecord>): UserRecord => {
    const id: number = Math.max(...Array.from(mockUsers.keys()), 0) + 1;
    const fullUser: UserRecord = { 
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
  
  getMockPhotos: (): PhotoRecord[] => Array.from(mockPhotos.values()),
  getMockUsers: (): UserRecord[] => Array.from(mockUsers.values()),
  
  setMockPhotos: (photos: PhotoRecord[]): void => {
    mockPhotos.clear();
    photos.forEach((photo: PhotoRecord) => mockPhotos.set(photo.id, photo));
  },
  
  setMockUsers: (users: UserRecord[]): void => {
    mockUsers.clear();
    users.forEach((user: UserRecord) => mockUsers.set(user.id, user));
  }
};

module.exports = mockKnex;
module.exports.mockDbHelpers = mockDbHelpers;
