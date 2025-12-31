/**
 * Admin Routes - JavaScript
 * 
 * Administrative endpoints for user management and content review.
 * 
 * SECURITY:
 * - All routes protected by authenticateToken + requireRole('admin')
 * - Uses Supabase Service Role Key (server-side only, never exposed to client)
 * - Email validation on both frontend and backend
 * 
 * Endpoints:
 * - POST /api/admin/invite - Send email invitation to new user
 * - GET /api/admin/suggestions - Fetch photos with AI-generated metadata for review
 */

const { Router } = require('express');
const { createClient } = require('@supabase/supabase-js');
const { getConfig } = require('../config/env');
const createAssessmentsDb = require('../services/assessmentsDb');
const { addAppAssessmentJob, checkRedisAvailable } = require('../queue');

// Email validation regex (safe pattern to prevent ReDoS)
// Limits length and uses specific character sets to avoid catastrophic backtracking
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function createAdminRouter({ db }) {
  const router = Router();
  const config = getConfig();
  const assessmentsDb = createAssessmentsDb({ db });

  function ensureAdmin(req, res) {
    // Redundant with mount-time middleware, but keeps the endpoints self-defensive.
    const role = req?.user?.role || req?.user?.app_metadata?.role;
    if (role !== 'admin') {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return false;
    }
    return true;
  }

  // Initialize Supabase Admin Client with Service Role Key
  // SECURITY: Service Role Key bypasses RLS and must NEVER be exposed to frontend
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!serviceRoleKey) {
    console.error('❌ CRITICAL: SUPABASE_SERVICE_ROLE_KEY not configured');
    console.error('   Admin invite functionality will not work');
    console.error('   Set this in your .env file (keep it secret!)');
  }

  const supabaseAdmin = serviceRoleKey 
    ? createClient(config.supabase.url, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })
    : null;

  /**
   * POST /api/admin/invite
   * 
   * Invite a new user by email using Supabase Auth Admin API.
   * 
   * SECURITY PATH:
   * - SOURCE: req.body.email (user-provided input)
   * - VALIDATION: Email format validation (regex)
   * - SINK: supabase.auth.admin.inviteUserByEmail()
   * 
   * @body {string} email - Email address to invite (required)
   * @returns {object} { success: true, data: { user, email_sent: boolean } }
   */
  router.post('/invite', async (req, res) => {
    try {
      const { email } = req.body;

      // Input validation
      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Email address is required'
        });
      }

      // SECURITY: Validate email format to prevent injection attacks
      const trimmedEmail = email.trim().toLowerCase();
      if (!EMAIL_REGEX.test(trimmedEmail)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }

      if (!supabaseAdmin) {
        return res.status(500).json({
          success: false,
          error: 'Admin functionality not configured'
        });
      }

      // Call Supabase Admin API to invite user
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(trimmedEmail, {
        redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/confirm-invite`
      });

      if (error) {
        console.error('[admin] Invite error:', error.message);
        return res.status(500).json({
          success: false,
          error: error.message || 'Failed to send invitation'
        });
      }

      return res.json({
        success: true,
        data: {
          user: data.user,
          email_sent: true
        }
      });
    } catch (err) {
      console.error('[admin] Invite exception:', err);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * GET /api/admin/suggestions
   * 
   * Fetch photos with AI-generated metadata for admin review.
   * 
   * Query parameters:
   * - state: Filter by state (optional, e.g., 'analyzed', 'pending')
   * - limit: Number of records to return (default: 50, max: 200)
   * - offset: Pagination offset (default: 0)
   * 
   * @returns {object} { success: true, data: PhotoSuggestion[], total: number }
   */
  router.get('/suggestions', async (req, res) => {
    try {
      const state = req.query.state;
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const offset = parseInt(req.query.offset, 10) || 0;

      let query = `
        SELECT 
          id, user_id, filename, ai_generated_metadata, 
          state, created_at, updated_at
        FROM photos
        WHERE ai_generated_metadata IS NOT NULL
      `;

      const params = [];
      let paramIndex = 1;

      // Add state filter if provided
      if (state && typeof state === 'string') {
        query += ` AND state = $${paramIndex}`;
        params.push(state);
        paramIndex++;
      }

      // Add ordering and pagination
      query += ` ORDER BY updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) as total FROM photos WHERE ai_generated_metadata IS NOT NULL';
      const countParams = [];
      if (state && typeof state === 'string') {
        countQuery += ' AND state = $1';
        countParams.push(state);
      }

      const countResult = await db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0]?.total || '0', 10);

      return res.json({
        success: true,
        data: result.rows,
        total,
        limit,
        offset
      });
    } catch (err) {
      console.error('[admin] Suggestions error:', err);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * POST /api/admin/assessments/trigger
   *
   * Creates a new assessment record and enqueues a BullMQ job to generate it.
   *
   * @body {string?} commit_hash
   * @returns {object} { success: true, data: { id, jobId } }
   */
  router.post('/assessments/trigger', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const redisOk = await checkRedisAvailable();
      if (!redisOk) {
        return res.status(503).json({ success: false, error: 'Queue service unavailable' });
      }

      const commit_hash = req?.body?.commit_hash;
      const created = await assessmentsDb.createAssessment({ commit_hash });

      const job = await addAppAssessmentJob(created.id);

      return res.json({
        success: true,
        data: {
          id: created.id,
          jobId: job?.id || null,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  });

  /**
   * GET /api/admin/assessments
   *
   * Lists assessments for admin review.
   */
  router.get('/assessments', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const status = req.query.status;
      const limit = req.query.limit;
      const offset = req.query.offset;

      const rows = await assessmentsDb.listAssessments({ limit, offset, status });
      return res.json({ success: true, data: rows });
    } catch (err) {
      return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  });

  /**
   * PATCH /api/admin/assessments/:id/confirm
   *
   * Confirms or rejects an assessment.
   * SECURITY: Server recomputes final_grade on confirm/reject.
   *
   * @body {string} reviewer_id
   * @body {string?} notes
   * @body {'confirmed'|'rejected'} decision
   */
  router.patch('/assessments/:id/confirm', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const id = req.params.id;
      const reviewer_id = req?.body?.reviewer_id;
      const notes = req?.body?.notes;
      const decision = req?.body?.decision;

      const updated = await assessmentsDb.confirmAssessment({ id, reviewer_id, notes, decision });
      return res.json({ success: true, data: updated });
    } catch (err) {
      const code = err?.statusCode || 500;
      return res.status(code).json({ success: false, error: err?.message || 'Internal server error' });
    }
  });

  return router;
}

module.exports = createAdminRouter;
