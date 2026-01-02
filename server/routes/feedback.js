/**
 * Feedback API Routes
 *
 * Public endpoint for collecting lightweight product feedback.
 *
 * Notes:
 * - No authentication required (avoid 401 when clients submit feedback without a bearer token)
 * - CSRF protection is handled globally via csurf middleware
 * - Rate limiting + validation help prevent abuse
 */

'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const logger = require('../logger');
const { getRateLimitStore } = require('../middleware/rateLimitStore');

function createFeedbackRateLimiter() {
  const isProduction = process.env.NODE_ENV === 'production';

  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: isProduction ? 30 : 300,
    store: getRateLimitStore(),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: 'Too many feedback submissions. Please try again later.',
    },
    validate: {
      trustProxy: false,
      xForwardedForHeader: false,
    },
  });
}

const feedbackValidation = [
  body('message')
    .trim()
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ max: 4000 })
    .withMessage('Message must be 4000 characters or less'),

  body('category')
    .optional()
    .trim()
    .isLength({ max: 80 })
    .withMessage('Category must be 80 characters or less'),

  body('url')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('URL must be 2000 characters or less'),

  body('context')
    .optional({ nullable: true })
    // accept object/array/primitive; we store JSON as-is
    .custom(() => true),
];

/**
 * @param {Object} options
 * @param {import('knex').Knex} options.db
 */
function createFeedbackRouter({ db }) {
  if (!db) throw new Error('db is required');

  const router = express.Router();
  const limiter = createFeedbackRateLimiter();

  router.post('/', limiter, feedbackValidation, async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array().map((e) => ({
            field: e.path,
            message: e.msg,
          })),
        });
      }

      const { message, category, url, context } = req.body || {};

      const record = {
        message,
        category: category || null,
        url: url || null,
        context: context ?? null,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || null,
        status: 'new',
      };

      const [inserted] = await db('feedback_messages')
        .insert(record)
        .returning(['id', 'created_at']);

      logger.info('[feedback] Submitted', {
        id: inserted && inserted.id,
        ip: req.ip,
      });

      return res.status(200).json({
        success: true,
        id: inserted && inserted.id,
      });
    } catch (error) {
      logger.error('[feedback] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'An error occurred while processing your request. Please try again later.',
      });
    }
  });

  return router;
}

module.exports = createFeedbackRouter;
