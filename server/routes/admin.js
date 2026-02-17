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
const { sendAdminAlert } = require('../services/sms');
const { addAIJob, addAppAssessmentJob, checkRedisAvailable } = require('../queue/index');

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
   * POST /api/admin/sms/test
   *
   * Send a test SMS to the configured admin phone number.
   */
  router.post('/sms/test', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const timestamp = new Date().toLocaleString();
      const alertMessage = `SMS Test - ${timestamp}`;

      await sendAdminAlert(alertMessage);

      return res.json({
        success: true,
        message: `SMS test sent (${timestamp})`
      });
    } catch (err) {
      console.error('[admin] SMS test error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
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
      if (!ensureAdmin(req, res)) return;

      const state = req.query.state;
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const offset = parseInt(req.query.offset, 10) || 0;

      // Build query using Knex query builder
      let query = db('photos')
        .select('id', 'user_id', 'filename', 'ai_generated_metadata', 'state', 'created_at', 'updated_at')
        .whereNotNull('ai_generated_metadata');

      // Add state filter if provided
      if (state && typeof state === 'string') {
        query = query.where('state', state);
      }

      // Add ordering and pagination
      const result = await query
        .orderBy('updated_at', 'desc')
        .limit(limit)
        .offset(offset);

      // Get total count for pagination
      let countQuery = db('photos').whereNotNull('ai_generated_metadata');
      if (state && typeof state === 'string') {
        countQuery = countQuery.where('state', state);
      }
      const countResult = await countQuery.count('* as total');
      const total = parseInt(countResult[0]?.total || '0', 10);

      return res.json({
        success: true,
        data: result,
        total,
        limit,
        offset
      });
    } catch (err) {
      console.error('[admin] Suggestions error:', err);
      console.error('[admin] Error details:', {
        message: err.message,
        stack: err.stack,
        query: req.query,
        dbAvailable: !!db,
        userId: req.user?.id,
        userRole: req.user?.role || req.user?.app_metadata?.role
      });
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * GET /api/admin/comments
   *
   * Fetch all comments for admin moderation with author and photo info.
   *
   * Query parameters:
   * - is_reviewed: Filter by review status (optional, 'true' or 'false')
   * - limit: Number of records to return (default: 50, max: 200)
   * - offset: Pagination offset (default: 0)
   *
   * @returns {object} { success: true, data: CommentWithDetails[], total: number }
   */
  router.get('/comments', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const isReviewed = req.query.is_reviewed;
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const offset = parseInt(req.query.offset, 10) || 0;

      // Build query using Knex query builder with joins
      let query = db('comments as c')
        .select(
          'c.id',
          'c.photo_id',
          'c.user_id',
          'c.content',
          'c.is_reviewed',
          'c.created_at',
          'c.updated_at',
          'u.username',
          'p.filename'
        )
        .leftJoin('users as u', 'c.user_id', 'u.id')
        .leftJoin('photos as p', 'c.photo_id', 'p.id');

      // Add is_reviewed filter if provided
      if (isReviewed === 'true' || isReviewed === 'false') {
        query = query.where('c.is_reviewed', isReviewed === 'true');
      }

      // Add ordering and pagination
      const result = await query
        .orderBy('c.created_at', 'desc')
        .limit(limit)
        .offset(offset);

      // Get total count for pagination
      let countQuery = db('comments');
      if (isReviewed === 'true' || isReviewed === 'false') {
        countQuery = countQuery.where('is_reviewed', isReviewed === 'true');
      }
      const countResult = await countQuery.count('* as total');
      const total = parseInt(countResult[0]?.total || '0', 10);

      return res.json({
        success: true,
        data: result,
        total,
        limit,
        offset
      });
    } catch (err) {
      console.error('[admin] Comments error:', err);
      console.error('[admin] Error details:', {
        message: err.message,
        stack: err.stack,
        query: req.query,
        dbAvailable: !!db,
        userId: req.user?.id,
        userRole: req.user?.role || req.user?.app_metadata?.role
      });
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * PATCH /api/admin/comments/:id/review
   *
   * Mark a comment as reviewed.
   *
   * @param {number} id - Comment ID
   * @returns {object} { success: true, data: Comment }
   */
  router.patch('/comments/:id/review', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const commentId = parseInt(req.params.id, 10);

      if (Number.isNaN(commentId) || commentId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid comment ID is required'
        });
      }

      // Update using Knex query builder
      const result = await db('comments')
        .where('id', commentId)
        .update({
          is_reviewed: true,
          updated_at: db.fn.now()
        })
        .returning('*');

      if (result.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Comment not found'
        });
      }

      return res.json({
        success: true,
        data: result[0]
      });
    } catch (err) {
      console.error('[admin] Review comment error:', err);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * GET /api/admin/feedback
   *
   * Fetch user-submitted feedback messages for admin moderation.
   *
   * Query parameters:
   * - status: Filter by feedback status (optional, e.g., 'new')
   * - limit: Number of records to return (default: 50, max: 200)
   * - offset: Pagination offset (default: 0)
   *
   * SECURITY PATH:
   * - SOURCE: req.query.status / req.query.limit / req.query.offset (user-controlled)
   * - VALIDATION: numeric parsing + clamping; status allowlist pattern + length
   * - SINK: db('feedback_messages') query builder (parameterized SQL)
   * - PATH: validated query params -> Knex where/limit/offset -> database
   *
   * @returns {object} { success: true, data: FeedbackMessage[], total: number, limit: number, offset: number }
   */
  router.get('/feedback', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const status = req.query.status;
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

      // SECURITY: Basic allowlist for status to prevent weird/unexpected values.
      // (Knex is parameterized, but we still validate to reduce log/UX surprises.)
      const statusFilter =
        typeof status === 'string' && status.length > 0
          ? status.trim().toLowerCase()
          : null;

      if (statusFilter && (statusFilter.length > 50 || !/^[a-z0-9_-]+$/i.test(statusFilter))) {
        return res.status(400).json({ success: false, error: 'Invalid status filter' });
      }

      let query = db('feedback_messages')
        .select(
          'id',
          'message',
          'category',
          'status',
          'url',
          'context',
          'ip_address',
          'user_agent',
          'created_at',
          'updated_at'
        );

      if (statusFilter) {
        query = query.where('status', statusFilter);
      }

      const result = await query
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      let countQuery = db('feedback_messages');
      if (statusFilter) {
        countQuery = countQuery.where('status', statusFilter);
      }
      const countResult = await countQuery.count('* as total');
      const total = parseInt(countResult[0]?.total || '0', 10);

      return res.json({
        success: true,
        data: result,
        total,
        limit,
        offset,
      });
    } catch (err) {
      // SECURITY: Avoid logging tainted strings from req.query or feedback contents.
      console.error('[admin] Feedback error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * GET /api/admin/activity
   *
   * Fetch user activity logs for admin auditing.
   *
   * Query parameters:
   * - limit: Number of records to return (default: 50, max: 200)
   * - offset: Pagination offset (default: 0)
   * - action: Optional action filter
   * - user_id: Optional user id filter
   */
  router.get('/activity', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

      const rawAction = req.query.action;
      const rawUserId = req.query.user_id;

      const action =
        typeof rawAction === 'string' && rawAction.trim().length > 0
          ? rawAction.trim().toLowerCase()
          : null;

      const userId =
        typeof rawUserId === 'string' && rawUserId.trim().length > 0
          ? rawUserId.trim()
          : null;

      if (action && (action.length > 50 || !/^[a-z0-9_]+$/i.test(action))) {
        return res.status(400).json({ success: false, error: 'Invalid action filter' });
      }

      if (userId && userId.length > 64) {
        return res.status(400).json({ success: false, error: 'Invalid user_id filter' });
      }

      let query = db('user_activity_log').select('id', 'user_id', 'action', 'metadata', 'created_at');

      if (action) {
        query = query.where('action', action);
      }

      if (userId) {
        query = query.where('user_id', userId);
      }

      const result = await query.orderBy('created_at', 'desc').limit(limit).offset(offset);

      const toMetadataObject = (value) => {
        if (!value) return {};
        if (typeof value === 'object' && !Array.isArray(value)) return value;
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              return parsed;
            }
          } catch {
            return {};
          }
        }
        return {};
      };

      const summarizeActivity = (activityAction, metadata) => {
        switch (activityAction) {
          case 'sign_in':
            return 'Signed in';
          case 'sign_out':
            return 'Signed out';
          case 'password_change':
            return 'Changed password';
          case 'username_set':
            return metadata?.username ? `Set username to ${metadata.username}` : 'Updated username';
          case 'message_sent':
            return metadata?.roomId ? `Sent chat message in room ${metadata.roomId}` : 'Sent chat message';
          case 'game_played':
            return metadata?.gameId ? `Played chess move in game ${metadata.gameId}` : 'Played chess move';
          case 'page_view': {
            const page = typeof metadata?.page === 'string' ? metadata.page : '';
            if (page === 'photos' || page === 'gallery') return 'Viewed images';
            if (page === 'messages') return 'Opened chat';
            if (page === 'games') return 'Opened chess';
            return page ? `Viewed ${page}` : 'Viewed page';
          }
          case 'auto_logout_inactive':
            return 'Auto-logged out due to inactivity';
          default:
            return String(activityAction || 'activity').replace(/_/g, ' ');
        }
      };

      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const idsToResolve = [...new Set(
        result
          .map((row) => {
            const metadata = toMetadataObject(row.metadata);
            if (typeof metadata.actor_email === 'string' && metadata.actor_email.trim()) {
              return null;
            }
            return typeof row.user_id === 'string' && UUID_REGEX.test(row.user_id) ? row.user_id : null;
          })
          .filter(Boolean)
      )];

      const actorById = new Map();
      if (supabaseAdmin && idsToResolve.length > 0) {
        await Promise.all(idsToResolve.map(async (id) => {
          try {
            const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
            if (error || !data?.user) return;

            actorById.set(id, {
              email: typeof data.user.email === 'string' ? data.user.email : null,
              username: typeof data.user.user_metadata?.username === 'string'
                ? data.user.user_metadata.username
                : null,
            });
          } catch {
            // Best-effort enrichment only.
          }
        }));
      }

      const enriched = result.map((row) => {
        const metadata = toMetadataObject(row.metadata);
        const lookedUp = actorById.get(row.user_id) || {};
        const actorEmail = (typeof metadata.actor_email === 'string' && metadata.actor_email.trim())
          ? metadata.actor_email
          : lookedUp.email || null;
        const actorUsername = (typeof metadata.actor_username === 'string' && metadata.actor_username.trim())
          ? metadata.actor_username
          : lookedUp.username || null;
        const actorLabel = actorEmail || actorUsername || row.user_id;

        return {
          ...row,
          metadata,
          actor_email: actorEmail,
          actor_username: actorUsername,
          actor_label: actorLabel,
          summary: summarizeActivity(row.action, metadata),
        };
      });

      let countQuery = db('user_activity_log');
      let distinctUsersQuery = db('user_activity_log');
      if (action) {
        countQuery = countQuery.where('action', action);
        distinctUsersQuery = distinctUsersQuery.where('action', action);
      }
      if (userId) {
        countQuery = countQuery.where('user_id', userId);
        distinctUsersQuery = distinctUsersQuery.where('user_id', userId);
      }

      const countResult = await countQuery.count('* as total');
      const total = parseInt(countResult[0]?.total || '0', 10);

      let totalUsers = 0;
      try {
        if (typeof distinctUsersQuery?.countDistinct === 'function') {
          const distinctUsersResult = await distinctUsersQuery.countDistinct('user_id as total_users');
          totalUsers = parseInt(distinctUsersResult?.[0]?.total_users || '0', 10);
        }
      } catch {
        totalUsers = 0;
      }

      return res.json({
        success: true,
        data: enriched,
        total,
        totalUsers,
        limit,
        offset,
      });
    } catch (err) {
      console.error('[admin] Activity error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * GET /api/admin/access-requests
   *
   * Fetch access request submissions from the public contact form.
   * Only returns subjects prefixed with "Access Request:".
   *
   * Query parameters:
   * - limit: Number of records to return (default: 50, max: 200)
   * - offset: Pagination offset (default: 0)
   */
  router.get('/access-requests', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      const subjectPrefix = 'Access Request:';

      const result = await db('contact_messages')
        .select(
          'id',
          'name',
          'email',
          'subject',
          'message',
          'status',
          'ip_address',
          'created_at',
          'updated_at'
        )
        .where('subject', 'like', `${subjectPrefix}%`)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      const countResult = await db('contact_messages')
        .where('subject', 'like', `${subjectPrefix}%`)
        .count('* as total');

      const total = parseInt(countResult[0]?.total || '0', 10);

      return res.json({
        success: true,
        data: result,
        total,
        limit,
        offset,
      });
    } catch (err) {
      console.error('[admin] Access requests error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * DELETE /api/admin/access-requests/:id
   *
   * Permanently delete an access request.
   */
  router.delete('/access-requests/:id', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const requestId = String(req.params.id || '').trim();
      const isUuid = /^[0-9a-fA-F-]{36}$/.test(requestId);

      if (!requestId || !isUuid) {
        return res.status(400).json({ success: false, error: 'Valid request ID is required' });
      }

      const deleted = await db('contact_messages').where('id', requestId).del();
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Access request not found' });
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('[admin] Delete access request error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
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
      const status = err?.statusCode || 500;
      return res.status(status).json({
        success: false,
        error: err?.message || 'Internal server error',
        code: err?.code,
      });
    }
  });

  /**
   * GET /api/admin/assessments/:id
   *
   * Fetch a single assessment (includes raw_ai_response + trace_log).
   */
  router.get('/assessments/:id', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;
      const id = req.params.id;
      const row = await assessmentsDb.getAssessmentById(id);
      if (!row) return res.status(404).json({ success: false, error: 'Assessment not found' });
      return res.json({ success: true, data: row });
    } catch (err) {
      const status = err?.statusCode || 500;
      return res.status(status).json({
        success: false,
        error: err?.message || 'Internal server error',
        code: err?.code,
      });
    }
  });

  /**
   * POST /api/admin/assessments/external
   *
   * Creates an assessment record from an external LLM review (e.g., ChatGPT/Gemini).
   *
   * @body {string} llm_provider
   * @body {string} llm_model
   * @body {string?} commit_hash
   * @body {string?} prompt
   * @body {string} responseText
   * @body {number?} final_grade
   */
  router.post('/assessments/external', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const commit_hash = req?.body?.commit_hash;
      const llm_provider = req?.body?.llm_provider;
      const llm_model = req?.body?.llm_model;
      const prompt = req?.body?.prompt;
      const responseText = req?.body?.responseText;
      const final_grade = req?.body?.final_grade;

      const created = await assessmentsDb.createExternalAssessment({
        commit_hash,
        llm_provider,
        llm_model,
        prompt,
        responseText,
        final_grade: typeof final_grade === 'number' ? final_grade : undefined,
      });

      return res.json({ success: true, data: { id: created.id } });
    } catch (err) {
      const code = err?.statusCode || 500;
      return res.status(code).json({
        success: false,
        error: err?.message || 'Internal server error',
        code: err?.code,
      });
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
      return res.status(code).json({
        success: false,
        error: err?.message || 'Internal server error',
        code: err?.code,
      });
    }
  });

  /**
   * POST /api/admin/maintenance/fix-collectibles
   *
   * Enqueue repairs for collectible reference photos missing display assets.
   * Designed for hosting environments without SSH/terminal access.
   *
   * Query:
   * - photos where collectible_id IS NOT NULL
   * - and display_path IS NULL
   * - limited to 100 per request to avoid timeouts
   *
   * Enqueue options:
   * - runAiAnalysis: false (skip expensive AI)
   * - generateThumbnail: true
   * - generateDisplay: true
   */
  router.post('/maintenance/fix-collectibles', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const requestDb = req.db || db;
      if (!requestDb || typeof requestDb !== 'function') {
        return res.status(500).json({ success: false, error: 'Database unavailable' });
      }

      const redisOk = await checkRedisAvailable();
      if (!redisOk) {
        return res.status(503).json({ success: false, error: 'Queue service unavailable' });
      }

      const rows = await requestDb('photos')
        .select('id', 'storage_path')
        .whereNotNull('collectible_id')
        .whereNull('display_path')
        .limit(100);

      let enqueued = 0;
      for (const row of rows || []) {
        const photoId = row && typeof row.id === 'number' ? row.id : null;
        if (!photoId) continue;

        try {
          await addAIJob(photoId, {
            runAiAnalysis: false,
            generateThumbnail: true,
            generateDisplay: true,
            requestId: req.requestId,
          });
          enqueued += 1;
        } catch (err) {
          console.warn('[admin] Failed to enqueue collectible repair job', {
            photoId: String(photoId),
            error: err?.message || String(err),
          });
        }
      }

      return res.json({ success: true, count: enqueued });
    } catch (err) {
      return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  });

  return router;
}

module.exports = createAdminRouter;
