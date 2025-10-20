const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Get JWT secret from environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Account lockout settings
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME_MINUTES = 15;

/**
 * Middleware to verify JWT token and authenticate users
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Access token required' 
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false, 
          error: 'Token expired' 
        });
      }
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid token' 
      });
    }
    
    req.user = user;
    next();
  });
}

/**
 * Middleware to require specific roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Insufficient permissions' 
      });
    }
    
    next();
  };
}

/**
 * Generate JWT token for user
 */
function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Hash password securely
 */
async function hashPassword(password) {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify password against hash
 */
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Check if account is locked due to failed login attempts
 */
function isAccountLocked(user) {
  if (!user.account_locked_until) {
    return false;
  }
  
  const lockoutTime = new Date(user.account_locked_until);
  const now = new Date();
  
  return now < lockoutTime;
}

/**
 * Lock account after too many failed attempts
 */
async function lockAccount(db, userId) {
  const lockoutUntil = new Date(Date.now() + LOCKOUT_TIME_MINUTES * 60 * 1000);
  
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET account_locked_until = ?, failed_login_attempts = ? WHERE id = ?',
      [lockoutUntil.toISOString(), MAX_LOGIN_ATTEMPTS, userId],
      function(err) {
        if (err) reject(err);
        else resolve(this);
      }
    );
  });
}

/**
 * Increment failed login attempts
 */
async function incrementFailedAttempts(db, userId) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET failed_login_attempts = failed_login_attempts + 1, last_login_attempt = datetime("now") WHERE id = ?',
      [userId],
      function(err) {
        if (err) reject(err);
        else resolve(this);
      }
    );
  });
}

/**
 * Reset failed login attempts on successful login
 */
async function resetFailedAttempts(db, userId) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL, last_login_attempt = datetime("now") WHERE id = ?',
      [userId],
      function(err) {
        if (err) reject(err);
        else resolve(this);
      }
    );
  });
}

/**
 * Get user by username
 */
async function getUserByUsername(db, username) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM users WHERE username = ? AND is_active = 1',
      [username],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

/**
 * Get user by email
 */
async function getUserByEmail(db, email) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM users WHERE email = ? AND is_active = 1',
      [email],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

/**
 * Create new user
 */
async function createUser(db, userData) {
  const { username, email, password, role = 'user' } = userData;
  const passwordHash = await hashPassword(password);
  
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, role],
      function(err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            reject(new Error('Username or email already exists'));
          } else {
            reject(err);
          }
        } else {
          resolve({ id: this.lastID, username, email, role });
        }
      }
    );
  });
}

/**
 * Validate password strength
 */
function validatePassword(password) {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  const errors = [];
  
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }
  
  if (!hasUpperCase) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!hasLowerCase) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!hasNumbers) {
    errors.push('Password must contain at least one number');
  }
  
  if (!hasSpecialChar) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = {
  authenticateToken,
  requireRole,
  generateToken,
  hashPassword,
  verifyPassword,
  isAccountLocked,
  lockAccount,
  incrementFailedAttempts,
  resetFailedAttempts,
  getUserByUsername,
  getUserByEmail,
  createUser,
  validatePassword,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_TIME_MINUTES
};