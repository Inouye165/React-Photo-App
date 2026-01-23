/**
 * Public API Routes - TypeScript
 * 
 * These routes are accessible without authentication.
 * Rate limiting and input validation are applied to prevent abuse.
 */

'use strict';

import express, { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { sendAdminAlert } from '../services/sms';

const logger = require('../logger');
const { getRateLimitStore } = require('../middleware/rateLimitStore');

interface ContactRequestBody {
  name: string;
  email: string;
  subject?: string;
  message: string;
}

/**
 * Create rate limiter with environment-aware configuration
 * Production: Strict limits (5 requests/hour)
 * Development/Test: Relaxed limits (100 requests/hour)
 */
function createContactRateLimiter() {
  const isProduction = process.env.NODE_ENV === 'production';

  return rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: isProduction ? 5 : 100,
    store: getRateLimitStore(),
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
      success: false,
      error: 'Too many contact requests. Please try again later.'
    },
    // Let express-rate-limit handle IP extraction (respects trust proxy)
    // No custom keyGenerator needed - default handles IPv6 properly
    validate: {
      // Disable IPv6 warning since we're using the default keyGenerator
      trustProxy: false,
      xForwardedForHeader: false
    }
  });
}

/**
 * Validation rules for contact form submission
 * 
 * SECURITY NOTES:
 * - We do NOT use .escape() to prevent HTML entity corruption of legitimate text
 * - Length limits are enforced at both API and database levels
 * - Email normalization prevents duplicate submissions via email variations
 */
const contactValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ max: 100 }).withMessage('Name must be 100 characters or less'),

  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email must be 255 characters or less'),

  body('subject')
    .optional()
    .trim()
    .isLength({ max: 150 }).withMessage('Subject must be 150 characters or less'),

  body('message')
    .trim()
    .notEmpty().withMessage('Message is required')
    .isLength({ max: 4000 }).withMessage('Message must be 4000 characters or less')
];

/**
 * Creates the public router with database dependency injection
 * @param {Object} options
 * @param {import('knex').Knex} options.db - Database connection
 * @returns {express.Router}
 */
function createPublicRouter({ db }: { db: any }): Router {
  const router = express.Router();

  // Apply rate limiting to contact endpoint
  const contactLimiter = createContactRateLimiter();

  /**
   * POST /contact
   * 
   * Submit a contact form message.
   * Rate limited and validated.
   */
  router.post(
    '/contact',
    contactLimiter,
    contactValidation,
    async (req: Request<unknown, unknown, ContactRequestBody>, res: Response) => {
      try {
        // Check validation results
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array().map((e) => ({
              field: 'param' in e ? e.param : ('path' in e ? e.path : 'unknown'),
              message: e.msg
            }))
          });
        }

        const { name, email, subject, message } = req.body;
        const normalizedSubject = subject || 'General Inquiry';

        // Insert into database
        const [inserted] = await db('contact_messages')
          .insert({
            name,
            email,
            subject: normalizedSubject,
            message,
            ip_address: req.ip,
            status: 'new'
          })
          .returning(['id', 'created_at']);

        logger.info('[public] Contact form submitted', {
          id: inserted.id,
          email: email.substring(0, 3) + '***', // Log partial email for privacy
          ip: req.ip
        });

        const alertMessage = `New Contact from ${email}: ${normalizedSubject}`;
        void sendAdminAlert(alertMessage);

        return res.status(200).json({
          success: true,
          message: 'Thank you for your message. We will respond within 24-48 hours.',
          id: inserted.id
        });

      } catch (error) {
        logger.error('[public] Contact form error:', error);
        return res.status(500).json({
          success: false,
          error: 'An error occurred while processing your request. Please try again later.'
        });
      }
    }
  );

  return router;
}

module.exports = createPublicRouter;
