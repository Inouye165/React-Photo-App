/**
 * Admin Routes - TypeScript
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

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { getConfig } from '../config/env';
import { sendAdminAlert } from '../services/sms';

const createAssessmentsDb = require('../services/assessmentsDb');

// Queue helpers (CommonJS export)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { addAIJob, addAppAssessmentJob, checkRedisAvailable } = require('../queue/index');

// Types
interface AdminInviteRequest {
  email: string;
}

interface PhotoSuggestion {
  id: string;
  user_id: string;
  filename: string;
  ai_generated_metadata: Record<string, unknown> | null;
  state: string;
  created_at: string;
  updated_at: string;
}

interface AccessRequestRow {
  id: string | number;
  name: string | null;
  email: string | null;
  subject: string | null;
  message: string | null;
  status: string | null;
  ip_address: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthenticatedRequest extends Request {
  // Express request properties (explicit here to satisfy server-side type-checking)
  body: any;
  query: any;
  params: any;
  headers: any;
  db?: any;
  requestId?: string;
  user?: {
    id: string;
    email: string;
    username: string;
    role: string;
    app_metadata?: {
      role?: string;
    };
  };
}

// Email validation regex (safe pattern to prevent ReDoS)
// Limits length and uses specific character sets to avoid catastrophic backtracking
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function createAdminRouter({ db }: { db: any }): Router {
  const router = Router();
  const config = getConfig();
  const assessmentsDb = createAssessmentsDb({ db });

  function ensureAdmin(req: AuthenticatedRequest, res: Response): boolean {
    // Redundant with mount-time middleware, but keeps the endpoints self-defensive.
    const role = req?.user?.role || req?.user?.app_metadata?.role;
    if (role !== 'admin') {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return false;
    }
    return true;
  }

  function parsePaginationInt(
    value: unknown,
    defaultValue: number,
    options: { min: number; max?: number }
  ): { type: 'ok'; value: number } | { type: 'error'; error: string } {
    if (value === undefined || value === null || value === '') {
      return { type: 'ok', value: defaultValue };
    }

    if (typeof value !== 'string') {
      return { type: 'error', error: 'Invalid pagination value' };
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      return { type: 'error', error: 'Invalid pagination value' };
    }

    if (parsed < options.min) {
      return { type: 'error', error: 'Invalid pagination value' };
    }

    if (typeof options.max === 'number' && parsed > options.max) {
      return { type: 'error', error: 'Invalid pagination value' };
    }

    return { type: 'ok', value: parsed };
  }

  function parseAccessRequestId(
    value: unknown
  ): { type: 'ok'; value: string | number } | { type: 'error'; error: string } {
    if (typeof value !== 'string') {
      return { type: 'error', error: 'Valid access request ID is required' };
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return { type: 'error', error: 'Valid access request ID is required' };
    }

    if (/^\d+$/.test(trimmed)) {
      const numericId = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(numericId) || numericId <= 0) {
        return { type: 'error', error: 'Valid access request ID is required' };
      }
      return { type: 'ok', value: numericId };
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmed)) {
      return { type: 'error', error: 'Valid access request ID is required' };
    }

    return { type: 'ok', value: trimmed };
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
  router.post('/invite', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email } = req.body as AdminInviteRequest;

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
  router.post('/sms/test', async (req: AuthenticatedRequest, res: Response) => {
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
   * GET /api/admin/access-requests
   *
   * Fetch access requests stored in contact_messages.
   *
   * Query parameters:
   * - limit: Number of records to return (default: 50, max: 200)
   * - offset: Pagination offset (default: 0)
   */
  router.get('/access-requests', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const limitResult = parsePaginationInt(req.query.limit, 50, { min: 0, max: 200 });
      if (limitResult.type === 'error') {
        return res.status(400).json({ success: false, error: limitResult.error });
      }

      const offsetResult = parsePaginationInt(req.query.offset, 0, { min: 0 });
      if (offsetResult.type === 'error') {
        return res.status(400).json({ success: false, error: offsetResult.error });
      }

      const limit = limitResult.value;
      const offset = offsetResult.value;

      const result = await db('contact_messages')
        .select('id', 'name', 'email', 'subject', 'message', 'status', 'ip_address', 'created_at', 'updated_at')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      const countResult = await db('contact_messages').count('* as total');
      const total = Number.parseInt(countResult[0]?.total || '0', 10);

      return res.json({
        success: true,
        data: result as AccessRequestRow[],
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
   * Delete an access request by ID.
   */
  router.delete('/access-requests/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const idResult = parseAccessRequestId(req.params.id);
      if (idResult.type === 'error') {
        return res.status(400).json({ success: false, error: idResult.error });
      }

      const deletedCount = await db('contact_messages').where('id', idResult.value).del();

      if (!deletedCount) {
        return res.status(404).json({ success: false, error: 'Access request not found' });
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('[admin] Access requests delete error:', err);
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
  router.get('/suggestions', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const state = req.query.state as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
      const offset = parseInt(req.query.offset as string, 10) || 0;

      // Build query using Knex query builder
      let query = db('photos')
        .select('id', 'user_id', 'filename', 'ai_generated_metadata', 'state', 'created_at', 'updated_at')
        .whereNotNull('ai_generated_metadata');

      // Add state filter if provided
      if (state && typeof state === 'string') {
        query = query.where('state', state);
      }

      // Add ordering and pagination
      const result = await query.orderBy('updated_at', 'desc').limit(limit).offset(offset);

      // Get total count for pagination
      let countQuery = db('photos').whereNotNull('ai_generated_metadata');
      if (state && typeof state === 'string') {
        countQuery = countQuery.where('state', state);
      }
      const countResult = await countQuery.count('* as total');
      const total = parseInt(countResult[0]?.total || '0', 10);

      return res.json({
        success: true,
        data: result as PhotoSuggestion[],
        total,
        limit,
        offset
      });
    } catch (err) {
      console.error('[admin] Suggestions error:', err);
      console.error('[admin] Error details:', {
        message: (err as Error)?.message,
        stack: (err as Error)?.stack,
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
   */
  router.get('/comments', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const isReviewed = req.query.is_reviewed as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
      const offset = parseInt(req.query.offset as string, 10) || 0;

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
      const result = await query.orderBy('c.created_at', 'desc').limit(limit).offset(offset);

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
        message: (err as Error)?.message,
        stack: (err as Error)?.stack,
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
   */
  router.patch('/comments/:id/review', async (req: AuthenticatedRequest, res: Response) => {
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
   */
  router.get('/feedback', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const status = req.query.status as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
      const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

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

      const result = await query.orderBy('created_at', 'desc').limit(limit).offset(offset);

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
   * POST /api/admin/assessments/trigger
   *
   * Creates a new assessment record and enqueues a BullMQ job to generate it.
   */
  router.post('/assessments/trigger', async (req: AuthenticatedRequest, res: Response) => {
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
      return res.status(500).json({ success: false, error: (err as Error)?.message || 'Internal server error' });
    }
  });

  /**
   * GET /api/admin/assessments
   *
   * Lists assessments for admin review.
   */
  router.get('/assessments', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const status = req.query.status;
      const limit = req.query.limit;
      const offset = req.query.offset;

      const rows = await assessmentsDb.listAssessments({ limit, offset, status });
      return res.json({ success: true, data: rows });
    } catch (err: any) {
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
  router.get('/assessments/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;
      const id = req.params.id;
      const row = await assessmentsDb.getAssessmentById(id);
      if (!row) return res.status(404).json({ success: false, error: 'Assessment not found' });
      return res.json({ success: true, data: row });
    } catch (err: any) {
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
   */
  router.post('/assessments/external', async (req: AuthenticatedRequest, res: Response) => {
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
    } catch (err: any) {
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
   */
  router.patch('/assessments/:id/confirm', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const id = req.params.id;
      const reviewer_id = req?.body?.reviewer_id;
      const notes = req?.body?.notes;
      const decision = req?.body?.decision;

      const updated = await assessmentsDb.confirmAssessment({ id, reviewer_id, notes, decision });
      return res.json({ success: true, data: updated });
    } catch (err: any) {
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
  router.post('/maintenance/fix-collectibles', async (req: AuthenticatedRequest, res: Response) => {
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

      const rows: Array<{ id: number; storage_path?: string | null }> = await requestDb('photos')
        .select('id', 'storage_path')
        .whereNotNull('collectible_id')
        .whereNull('display_path')
        .limit(100);

      let enqueued = 0;
      for (const row of rows) {
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
        } catch (err: any) {
          console.warn('[admin] Failed to enqueue collectible repair job', {
            photoId: String(photoId),
            error: err?.message || String(err),
          });
        }
      }

      return res.json({ success: true, count: enqueued });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  });

  return router;
}

module.exports = createAdminRouter;
