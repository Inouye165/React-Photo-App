const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const {
  generateToken,
  verifyPassword,
  isAccountLocked,
  lockAccount,
  incrementFailedAttempts,
  resetFailedAttempts,
  getUserByUsername,
  getUserByEmail,
  createUser,
  validatePassword,
  authenticateToken,
  MAX_LOGIN_ATTEMPTS
} = require('../middleware/auth');

module.exports = function createAuthRouter({ db }) {
  const router = express.Router();

  // Rate limiting for auth endpoints (disabled in test environment)
  const authLimiter = process.env.NODE_ENV === 'test' ? 
    (req, res, next) => next() : // Skip rate limiting in tests
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // Limit each IP to 5 requests per windowMs
      message: {
        success: false,
        error: 'Too many authentication attempts, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false,
  });

  const registerLimiter = process.env.NODE_ENV === 'test' ? 
    (req, res, next) => next() : // Skip rate limiting in tests
    rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3, // Limit each IP to 3 registration attempts per hour
      message: {
        success: false,
      error: 'Too many registration attempts, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Validation rules
  const loginValidation = [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
  ];

  const registerValidation = [
    body('username')
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3 and 30 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('password')
      .custom((value) => {
        const validation = validatePassword(value);
        if (!validation.isValid) {
          throw new Error(validation.errors.join(', '));
        }
        return true;
      })
  ];

  // Helper function to handle validation errors
  const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  };

  /**
   * POST /auth/login
   * Authenticate user and return JWT token
   */
  router.post('/auth/login', authLimiter, loginValidation, handleValidationErrors, async (req, res) => {
    try {
      const { username, password } = req.body;
      const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      // Get user by username
      const user = await getUserByUsername(db, username);
      if (!user) {
        console.warn(`[LOGIN FAIL] User not found: username='${username}' ip='${clientIp}'`);
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      // Check if account is locked
      if (isAccountLocked(user)) {
        console.warn(`[LOGIN FAIL] Account locked: username='${username}' ip='${clientIp}'`);
        return res.status(423).json({
          success: false,
          error: `Account is locked due to too many failed login attempts. Please try again later.`
        });
      }

      // Verify password
      const isValidPassword = await verifyPassword(password, user.password_hash);
      if (!isValidPassword) {
        // Increment failed attempts
        await incrementFailedAttempts(db, user.id);
        // Check if we should lock the account
        if (user.failed_login_attempts + 1 >= MAX_LOGIN_ATTEMPTS) {
          await lockAccount(db, user.id);
          console.warn(`[LOGIN FAIL] Account locked after max attempts: username='${username}' ip='${clientIp}'`);
          return res.status(423).json({
            success: false,
            error: `Account locked due to ${MAX_LOGIN_ATTEMPTS} failed login attempts. Please try again later.`
          });
        }
        console.warn(`[LOGIN FAIL] Invalid password: username='${username}' ip='${clientIp}'`);
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      // Reset failed attempts on successful login
      await resetFailedAttempts(db, user.id);

      // Generate JWT token
      const token = generateToken(user);

      // Set httpOnly cookie for the token (transitional: also return token in JSON)
      try {
        const cookieOptions = {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          // In production with cross-site frontends you'll likely need 'None'
          sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        };
        res.cookie('authToken', token, cookieOptions);
      } catch (e) {
        console.warn('Failed to set auth cookie:', e && e.message ? e.message : e);
      }
      // Log successful login
      console.info(`[LOGIN SUCCESS] username='${username}' ip='${clientIp}'`);

      // Return success (token is set as an httpOnly cookie). Also return token in JSON
      // to support non-browser clients/tests that expect it. Frontend should rely on cookie.
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * POST /auth/register
   * Register new user account
   */
  router.post('/auth/register', registerLimiter, registerValidation, handleValidationErrors, async (req, res) => {
    try {
      const { username, email, password } = req.body;

      // Check if username already exists
      const existingUsername = await getUserByUsername(db, username);
      if (existingUsername) {
        return res.status(409).json({
          success: false,
          error: 'Username already exists'
        });
      }

      // Check if email already exists
      const existingEmail = await getUserByEmail(db, email);
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: 'Email already registered'
        });
      }

      // Create new user (default role is 'user')
      const newUser = await createUser(db, {
        username,
        email,
        password,
        role: 'user'
      });

      // Generate JWT token
      const token = generateToken(newUser);

      // Set httpOnly cookie for the token (transitional: also return token in JSON)
      try {
        const cookieOptions = {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        };
        res.cookie('authToken', token, cookieOptions);
      } catch (e) {
        console.warn('Failed to set auth cookie on register:', e && e.message ? e.message : e);
      }

      res.status(201).json({
        success: true,
        token,
        message: 'User registered successfully',
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role
        }
      });

    } catch (error) {
      console.error('Registration error:', error);
      if (error.message === 'Username or email already exists') {
        return res.status(409).json({
          success: false,
          error: error.message
        });
      }
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * POST /auth/verify
   * Verify JWT token and return user info
   */
  router.post('/auth/verify', authenticateToken, (req, res) => {
    // If we reach here, the token is valid (middleware would have rejected otherwise)
    res.json({
      success: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role
      }
    });
  });

  /**
   * POST /auth/logout
   * Logout endpoint (mainly for frontend state management)
   * Note: With JWT, actual token invalidation would require a blacklist
   */
  router.post('/auth/logout', authenticateToken, (req, res) => {
    // In a production system, you might want to:
    // 1. Add the token to a blacklist
    // 2. Store revoked tokens in a cache (Redis)
    // 3. Use shorter token expiration times
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });

  /**
   * GET /auth/profile
   * Get current user profile
   */
  router.get('/auth/profile', authenticateToken, async (req, res) => {
    try {
      const user = await getUserByUsername(db, req.user.username);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          created_at: user.created_at
        }
      });
    } catch (error) {
      console.error('Profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  return router;
};