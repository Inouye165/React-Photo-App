// @ts-nocheck

/**
 * Comments Routes - JavaScript
 *
 * User comment endpoints for photo engagement.
 *
 * SECURITY:
 * - All routes protected by authenticateToken middleware (mounted at bootstrap)
 * - Content length validation prevents payload attacks
 * - Rate limiting via recent comment check
 * - Photo existence verified before comment creation
 *
 * Endpoints:
 * - POST /api/comments - Create a new comment on a photo
 * - GET /api/comments/:photoId - Get comments for a photo
 */

const { Router } = require('express');

// Constants
const MAX_CONTENT_LENGTH = 2000; // Characters
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_COMMENTS_PER_WINDOW = 5;

function createCommentsRouter({ db }) {
  const router = Router();

  /**
   * POST /api/comments
   *
   * Create a new comment on a photo.
   *
   * SECURITY PATH:
   * - SOURCE: req.body.photoId, req.body.content (user-provided input)
   * - VALIDATION: photoId existence, content length, rate limiting
   * - SINK: database insert
   *
   * @body {number} photoId - Photo ID to comment on (required)
   * @body {string} content - Comment text (required, max 2000 chars)
   * @returns {object} { success: true, data: Comment }
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

      const { photoId, content } = req.body;

      // Validate photoId
      if (photoId == null || typeof photoId !== 'number' || !Number.isInteger(photoId) || photoId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid photoId is required',
        });
      }

      // Validate content
      if (!content || typeof content !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Comment content is required',
        });
      }

      const trimmedContent = content.trim();

      if (trimmedContent.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Comment content cannot be empty',
        });
      }

      if (trimmedContent.length > MAX_CONTENT_LENGTH) {
        return res.status(400).json({
          success: false,
          error: `Comment must be ${MAX_CONTENT_LENGTH} characters or less`,
        });
      }

      // Verify photo exists
      const photo = await db('photos').where('id', photoId).first();

      if (!photo) {
        return res.status(404).json({
          success: false,
          error: 'Photo not found',
        });
      }

      // Rate limiting: Check recent comments from this user
      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
      const recentComments = await db('comments')
        .where('user_id', userId)
        .where('created_at', '>=', windowStart)
        .count('id as count')
        .first();

      const recentCount = Number(recentComments?.count || 0);

      if (recentCount >= MAX_COMMENTS_PER_WINDOW) {
        return res.status(429).json({
          success: false,
          error: 'Too many comments. Please wait before posting again.',
        });
      }

      // Insert comment
      const [insertedId] = await db('comments')
        .insert({
          photo_id: photoId,
          user_id: userId,
          content: trimmedContent,
          is_reviewed: false,
          created_at: db.fn.now(),
          updated_at: db.fn.now(),
        })
        .returning('id');

      // Handle different DB return formats (pg returns object, sqlite returns number)
      const commentId = typeof insertedId === 'object' ? insertedId.id : insertedId;

      // Fetch the created comment
      const comment = await db('comments').where('id', commentId).first();

      return res.status(201).json({
        success: true,
        data: comment,
      });
    } catch (error) {
      console.error('[comments] POST error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create comment',
      });
    }
  });

  /**
   * GET /api/comments/:photoId
   *
   * Get all comments for a specific photo.
   *
   * @param {number} photoId - Photo ID
   * @returns {object} { success: true, data: CommentWithAuthor[] }
   */
  router.get('/:photoId', async (req, res) => {
    try {
      const photoId = parseInt(req.params.photoId, 10);

      if (Number.isNaN(photoId) || photoId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid photoId is required',
        });
      }

      // Verify photo exists
      const photo = await db('photos').where('id', photoId).first();

      if (!photo) {
        return res.status(404).json({
          success: false,
          error: 'Photo not found',
        });
      }

      // Fetch comments with author usernames
      const comments = await db('comments')
        .select(
          'comments.id',
          'comments.photo_id',
          'comments.user_id',
          'comments.content',
          'comments.is_reviewed',
          'comments.created_at',
          'comments.updated_at',
          'users.username'
        )
        .leftJoin('users', 'comments.user_id', 'users.id')
        .where('comments.photo_id', photoId)
        .orderBy('comments.created_at', 'asc');

      return res.json({
        success: true,
        data: comments,
      });
    } catch (error) {
      console.error('[comments] GET error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch comments',
      });
    }
  });

  return router;
}

module.exports = createCommentsRouter;
