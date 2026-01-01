/**
 * Feedback Routes
 *
 * App-wide user feedback/suggestions endpoint.
 * Feedback is stored in the comments table with photo_id = NULL.
 *
 * SECURITY:
 * - All routes protected by authenticateToken middleware (mounted at bootstrap)
 * - Content length validation prevents payload attacks
 * - Rate limiting via recent feedback check
 *
 * Endpoints:
 * - POST /api/feedback - Submit app-wide feedback
 */

const { Router } = require('express');

// Constants
const MAX_CONTENT_LENGTH = 2000; // Characters
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_FEEDBACK_PER_WINDOW = 3;
const VALID_TYPES = ['suggestion', 'bug', 'question', 'other'];

function createFeedbackRouter({ db }) {
  const router = Router();

  /**
   * POST /api/feedback
   *
   * Submit app-wide feedback to administrators.
   *
   * SECURITY PATH:
   * - SOURCE: req.body.type, req.body.content (user-provided input)
   * - VALIDATION: type enum, content length, rate limiting
   * - SINK: database insert to comments table with photo_id = NULL
   *
   * @body {string} type - Feedback type: suggestion, bug, question, other
   * @body {string} content - Feedback text (required, max 2000 chars)
   * @returns {object} { success: true, data: { id, type, created_at } }
   */
  router.post('/', async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      const { type, content } = req.body;

      // Validate type
      if (!type || !VALID_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid feedback type. Must be one of: ${VALID_TYPES.join(', ')}`,
        });
      }

      // Validate content
      if (!content || typeof content !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Feedback content is required',
        });
      }

      const trimmedContent = content.trim();

      if (trimmedContent.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Feedback content cannot be empty',
        });
      }

      if (trimmedContent.length > MAX_CONTENT_LENGTH) {
        return res.status(400).json({
          success: false,
          error: `Feedback content must be ${MAX_CONTENT_LENGTH} characters or less`,
        });
      }

      // Rate limiting: Check recent feedback from this user
      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
      const recentCount = await db('comments')
        .where('user_id', userId)
        .whereNull('photo_id') // Feedback has no photo_id
        .where('created_at', '>=', windowStart)
        .count('id as count')
        .first();

      if (recentCount && Number(recentCount.count) >= MAX_FEEDBACK_PER_WINDOW) {
        return res.status(429).json({
          success: false,
          error: 'Too many feedback submissions. Please wait before submitting again.',
        });
      }

      // Insert feedback (stored as comment with photo_id = NULL)
      // The 'type' is stored in the content with a prefix for admin review
      const feedbackContent = `[${type.toUpperCase()}] ${trimmedContent}`;
      
      const [inserted] = await db('comments')
        .insert({
          photo_id: null, // NULL indicates app-wide feedback
          user_id: userId,
          content: feedbackContent,
          reviewed: false,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning(['id', 'created_at']);

      return res.status(201).json({
        success: true,
        data: {
          id: inserted.id,
          type,
          created_at: inserted.created_at,
        },
      });
    } catch (error) {
      console.error('[feedback] POST / error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to submit feedback',
      });
    }
  });

  return router;
}

module.exports = createFeedbackRouter;
