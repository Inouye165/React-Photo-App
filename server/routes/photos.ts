/**
 * Photos router: HTTP boundaries only.
 * Keep workflow-heavy logic in service helpers so handlers stay readable.
 */

import express, { Router, Request, Response } from 'express';
import path from 'path';
import { Readable } from 'stream';
import { Knex } from 'knex';
import { SupabaseClient } from '@supabase/supabase-js';

// Internal imports
const logger = require('../logger');
const { signThumbnailUrl, DEFAULT_TTL_SECONDS } = require('../utils/urlSigning');
const { addAIJob } = require('../queue');
const createPhotosDb = require('../services/photosDb');
const createPhotosStorage = require('../services/photosStorage');
const createPhotosImage = require('../services/photosImage');
const createPhotosAi = require('../services/photosAi');
const createPhotosState = require('../services/photosState');
const { authenticateToken } = require('../middleware/auth');
const { authenticateImageRequest } = require('../middleware/imageAuth');
const { checkRedisAvailable } = require('../queue');
const { isAiEnabled } = require('../utils/aiEnabled');
const { validateRequest } = require('../validation/validateRequest');
const { photosListQuerySchema, photoIdParamsSchema } = require('../validation/schemas/photos');
const { mapPhotoRowToListDto, mapPhotoRowToDetailDto } = require('../serializers/photos');
const {
  buildDeleteList,
  reextractMetadataWorkflow,
  sanitizeDownloadName,
  saveCaptionedImageWorkflow,
} = require('../services/photosWorkflows');

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Valid photo workflow states */
type PhotoState = 'working' | 'inprogress' | 'finished' | 'error';

/** Text style object for captioned images */
interface TextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  position?: { x: number; y: number };
}

/** Photo row from database */
interface PhotoRow {
  id: string;
  user_id: string;
  filename: string;
  original_filename?: string;
  state: PhotoState;
  metadata?: string | Record<string, unknown>;
  hash?: string;
  file_size?: number;
  caption?: string;
  description?: string;
  keywords?: string;
  text_style?: string | TextStyle;
  edited_filename?: string;
  storage_path?: string;
  original_path?: string;
  created_at: string;
  updated_at?: string;
  classification?: string;
  ai_model_history?: unknown;
  poi_analysis?: unknown;
  collectible_value_min?: number;
  collectible_value_max?: number;
  collectible_currency?: string;
  collectible_category?: string;
  collectible_specifics?: string | Record<string, unknown>;
}

/** Authenticated request with user info */
interface AuthenticatedRequest extends Request {
  // Express request properties (explicit here to satisfy server-side type-checking)
  body: any;
  query: any;
  params: any;
  headers: any;
  user?: {
    id: string;
    email: string;
    username?: string;
    role?: string;
  };
  validated?: {
    query?: {
      state?: PhotoState;
      limit?: number;
      cursor?: { created_at: string; id: number } | null;
    };
    params?: {
      id: string;
    };
  };
  id?: string;
  requestId?: string;
}

/** Status counts response */
interface StatusCountsResponse {
  success: boolean;
  working: number;
  inprogress: number;
  finished: number;
  error: number;
  total: number;
}

/** Photo list response */
interface PhotoListResponse {
  success: boolean;
  userId: string;
  photos: PhotoListDto[];
  nextCursor: string | null;
}

/** Photo list DTO (Data Transfer Object) */
interface PhotoListDto {
  id: string;
  filename: string;
  state: PhotoState;
  metadata: Record<string, unknown>;
  hash?: string;
  file_size?: number;
  caption?: string;
  description?: string;
  keywords?: string;
  textStyle?: TextStyle | null;
  editedFilename?: string | null;
  storagePath?: string | null;
  url: string;
  fullUrl?: string | null;
  originalUrl: string;
  thumbnail?: string | null;
  aiModelHistory?: unknown;
  poi_analysis?: unknown;
  classification?: string;
  thumbnailUrl?: string | null;
  smallThumbnail?: string | null;
  smallThumbnailUrl?: string | null;
}

/** Photo detail DTO */
interface PhotoDetailDto extends PhotoListDto {
  collectible_insights?: {
    estimatedValue: {
      min: number | null;
      max: number | null;
      currency: string;
    };
    category?: string;
    specifics?: Record<string, unknown>;
  } | null;
}

/** Thumbnail URL response */
interface ThumbnailUrlResponse {
  success: boolean;
  url: string | null;
  expiresAt: number | null;
  hasThumbnail: boolean;
}

/** Metadata update request body */
interface MetadataUpdateBody {
  caption?: string;
  description?: string;
  keywords?: string;
  textStyle?: TextStyle | null;
}

/** Save captioned image request body */
interface SaveCaptionedImageBody {
  photoId: string;
  dataURL: string;
  caption?: string;
  description?: string;
  keywords?: string;
  textStyle?: TextStyle | null;
}

/** AI recheck request body */
interface AiRecheckBody {
  model?: string;
  collectibleOverride?: {
    id: string;
    [key: string]: unknown;
  };
}

/** Error response */
interface ErrorResponse {
  success: false;
  error: string;
  reqId?: string;
  allowedModels?: string[];
  error_details?: string;
}

/** Models list response */
interface ModelsResponse {
  success: boolean;
  models: string[];
  source: string;
  updatedAt: string;
}

/** Dependencies response */
interface DependenciesResponse {
  success: boolean;
  dependencies: {
    aiQueue: boolean;
  };
}

/** State transition request body */
interface StateTransitionBody {
  state: PhotoState;
}

/** Router dependencies */
interface PhotosRouterDependencies {
  db: Knex;
  supabase: SupabaseClient;
}

// ============================================================================
// Constants
// ============================================================================

// UUID validation regex (Supabase format)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Model allowlists
const DYNAMIC_MODEL_ALLOWLIST: string[] = [];
const INTERNAL_MODEL_NAMES = ['router', 'scenery', 'collectible'];
const INTERNAL_MODEL_SET = new Set(INTERNAL_MODEL_NAMES);
const FALLBACK_MODEL_ALLOWLIST = ['gpt-4o', 'gpt-4-vision-preview', 'gpt-3.5-turbo', 'gpt-5'];
const MODEL_ALLOWLIST = DYNAMIC_MODEL_ALLOWLIST;

// Initialize with fallback models
const initialFallback = Array.from(new Set([...FALLBACK_MODEL_ALLOWLIST, ...INTERNAL_MODEL_NAMES]));
DYNAMIC_MODEL_ALLOWLIST.push(...initialFallback);

let LAST_ALLOWLIST_SOURCE = 'seed';
let LAST_ALLOWLIST_UPDATED_AT = new Date().toISOString();

// Valid photo states
const VALID_STATES: PhotoState[] = ['working', 'inprogress', 'finished', 'error'];

// ============================================================================
// Router Factory
// ============================================================================

export default function createPhotosRouter({ db, supabase }: PhotosRouterDependencies): Router {
  const router = Router();

  // Instantiate service dependencies
  const photosDb = createPhotosDb({ db });
  const photosStorage = createPhotosStorage({ storageClient: supabase.storage.from('photos') });
  const photosImage = createPhotosImage({ sharp: require('sharp'), exifr: require('exifr'), crypto: require('crypto') });
  const photosAi = createPhotosAi({ addAIJob, MODEL_ALLOWLIST: [] });
  const photosState = createPhotosState({ db, storage: photosStorage });

  // ============================================================================
  // GET /status - Dashboard status counts
  // ============================================================================
  router.get('/status', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const reqId = Math.random().toString(36).slice(2, 10);
    try {
      const userId = req.user?.id;
      if (!userId || typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
        logger.warn('[photos/status] Invalid user ID format', { reqId, userId: typeof userId });
        return res.status(400).json({ success: false, error: 'Invalid user identifier', reqId } as ErrorResponse);
      }

      const DB_QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS || 10000);

      const counts = await Promise.race([
        db('photos')
          .where('user_id', userId)
          .select('state')
          .count('* as count')
          .groupBy('state'),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DB query timeout')), DB_QUERY_TIMEOUT_MS)),
      ]);

      const result: StatusCountsResponse = {
        success: true,
        working: 0,
        inprogress: 0,
        finished: 0,
        error: 0,
        total: 0
      };

      for (const row of counts) {
        const state = row.state as PhotoState;
        const count = Number(row.count) || 0;
        if (VALID_STATES.includes(state)) {
          result[state] = count;
        }
        result.total += count;
      }

      res.set('Cache-Control', 'no-store');
      res.json(result);
    } catch (err) {
      const error = err as Error;
      logger.error('[photos/status] DB error', {
        reqId,
        endpoint: '/photos/status',
        error: {
          message: error?.message,
          code: (error as NodeJS.ErrnoException)?.code,
          stack: error?.stack?.split('\n').slice(0, 3).join(' | ')
        }
      });
      res.status(500).json({ success: false, error: 'Failed to retrieve photo status', reqId } as ErrorResponse);
    }
  });

  // ============================================================================
  // GET / - List photos with pagination
  // ============================================================================
  router.get('/', authenticateToken, validateRequest({ query: photosListQuerySchema }), async (req: AuthenticatedRequest, res: Response) => {
    const reqId = Math.random().toString(36).slice(2, 10);
    try {
      const state = req.validated?.query?.state;
      // Reduce default limit to prevent DB timeouts on large datasets
      const DEFAULT_LIMIT = Number(process.env.PHOTOS_DEFAULT_LIMIT) || 20;
      const MAX_LIMIT = Number(process.env.PHOTOS_MAX_LIMIT) || 100;

      const requestedLimit = Number.isInteger(req.validated?.query?.limit)
        ? (req.validated!.query!.limit as number)
        : DEFAULT_LIMIT;

      // Cap the limit to prevent abuse
      const limit = Math.min(requestedLimit, MAX_LIMIT);
      const cursor = req.validated?.query?.cursor ?? null;

      // Listing caching is handled inside photosDb.listPhotos (Redis-backed, user-scoped).
      const cacheInfo: { hit?: boolean } = {};

      const DB_QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS || 10000);

      const listStart = Date.now();
      let rows: PhotoRow[];
      try {
        rows = await photosDb.listPhotos(req.user!.id, state, {
          timeoutMs: DB_QUERY_TIMEOUT_MS,
          limit,
          cursor,
          cacheInfo,
        });
      } catch (err) {
        const error = err as Error & { name?: string };
        const message = error?.message ?? '';
        const isTimeout =
          error?.name === 'KnexTimeoutError' ||
          /defined query timeout|query timeout|timeout exceeded/i.test(message);

        if (isTimeout) {
          throw new Error('DB query timeout');
        }
        throw err;
      }

      const listMs = Date.now() - listStart;
      logger.info('[photos] listPhotos_ms', {
        reqId,
        state: state || null,
        limit,
        requestedLimit: req.validated?.query?.limit,
        hasCursor: Boolean(cursor),
        rowCount: rows.length,
        ms: listMs,
      });

      // Pagination: detect if more results exist
      let nextCursor: string | null = null;
      if (rows.length > limit) {
        rows = rows.slice(0, limit);
        const lastRow = rows[rows.length - 1];
        const cursorObj = {
          created_at: lastRow.created_at,
          id: lastRow.id
        };
        nextCursor = Buffer.from(JSON.stringify(cursorObj), 'utf8').toString('base64url');
      }

      // Map rows to DTOs with server-signed /display/thumbnails URLs (no per-row Supabase signing).
      const mapStart = Date.now();
      const PHOTOS_LIST_THUMB_TTL_SECONDS = 3600;
      const photosWithUrls: PhotoListDto[] = await Promise.all(
        rows.map((row: PhotoRow) =>
          mapPhotoRowToListDto(row, {
            ttlSeconds: PHOTOS_LIST_THUMB_TTL_SECONDS,
            signThumbnailUrl,
          })
        )
      );

      const mapMs = Date.now() - mapStart;
      logger.info('[photos] mapPhotos_ms', {
        reqId,
        ms: mapMs,
        rowCount: rows.length,
      });

      const response: PhotoListResponse = {
        success: true,
        userId: req.user!.id,
        photos: photosWithUrls,
        nextCursor
      };

      res.set('Cache-Control', 'no-store');
      res.set('X-Cache', cacheInfo.hit ? 'HIT' : 'MISS');
      res.json(response);
    } catch (err) {
      const error = err as Error;
      logger.error('[photos] DB error', {
        reqId,
        endpoint: '/photos',
        query: req.query,
        state: req.query.state,
        error: {
          message: error?.message,
          code: (error as NodeJS.ErrnoException)?.code,
          stack: error?.stack?.split('\n').slice(0, 3).join(' | ')
        }
      });
      res.status(500).json({ success: false, error: error.message, reqId } as ErrorResponse);
    }
  });

  // ============================================================================
  // GET /models - Available AI models
  // ============================================================================
  router.get('/models', authenticateToken, (_req: AuthenticatedRequest, res: Response) => {
    try {
      const filtered = DYNAMIC_MODEL_ALLOWLIST
        .filter((item: string) => typeof item === 'string' && item.length > 0 && !INTERNAL_MODEL_SET.has(item));
      const fallbackPublic = FALLBACK_MODEL_ALLOWLIST.filter((item: string) => !INTERNAL_MODEL_SET.has(item));
      const models = filtered.length > 0 ? filtered : fallbackPublic;
      res.set('Cache-Control', 'no-store');
      res.json({
        success: true,
        models,
        source: LAST_ALLOWLIST_SOURCE,
        updatedAt: LAST_ALLOWLIST_UPDATED_AT
      } as ModelsResponse);
    } catch (err) {
      const error = err as Error;
      logger.error('[AI Models] Failed to expose model allowlist', error?.message ?? error);
      res.status(500).json({ success: false, error: 'Failed to load model allowlist' } as ErrorResponse);
    }
  });

  // ============================================================================
  // GET /dependencies - Service dependency status
  // ============================================================================
  router.get('/dependencies', authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const redisAvailable = await checkRedisAvailable();
      res.set('Cache-Control', 'no-store');
      res.json({
        success: true,
        dependencies: {
          aiQueue: Boolean(redisAvailable),
        },
      } as DependenciesResponse);
    } catch (err) {
      const error = err as Error;
      logger.error('[Dependencies] Failed to report dependency status', error?.message ?? error);
      res.status(500).json({ success: false, error: 'Failed to determine dependency status' } as ErrorResponse);
    }
  });

  // ============================================================================
  // GET /:id - Single photo details
  // ============================================================================
  router.get('/:id', authenticateToken, validateRequest({ params: photoIdParamsSchema }), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.validated!.params!;
      const row = await photosDb.getPhotoByAnyId(id, req.user!.id);
      if (!row) return res.status(404).json({ success: false, error: 'Photo not found' } as ErrorResponse);

      const photo: PhotoDetailDto = mapPhotoRowToDetailDto(row, {
        ttlSeconds: 3600,
        signThumbnailUrl,
      });
      res.set('Cache-Control', 'private, max-age=60');
      return res.json({ success: true, photo });
    } catch (err) {
      const error = err as Error;
      logger.error('Error in GET /photos/:id', error);
      return res.status(500).json({ success: false, error: error.message } as ErrorResponse);
    }
  });

  // ============================================================================
  // GET /:id/original - Download original file
  // ============================================================================
  router.get('/:id/original', authenticateToken, validateRequest({ params: photoIdParamsSchema }), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.validated!.params!;

      const resolvedId = await photosDb.resolvePhotoPrimaryId(id, req.user!.id);
      if (!resolvedId) {
        return res.status(404).json({ success: false, error: 'Photo not found' } as ErrorResponse);
      }

      const row = await db('photos')
        .select(['id', 'user_id', 'original_path', 'storage_path', 'original_filename', 'filename'])
        .where({ id: resolvedId, user_id: req.user!.id })
        .first() as PhotoRow | undefined;

      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' } as ErrorResponse);
      }

      const objectPath = row.original_path || row.storage_path;
      if (!objectPath) {
        return res.status(409).json({ success: false, error: 'Original not available' } as ErrorResponse);
      }

      const { data, error } = await supabase.storage.from('photos').createSignedUrl(objectPath, 60);
      if (error || !data?.signedUrl) {
        logger.error('[photos/:id/original] Failed to create signed URL', { photoId: resolvedId, requestedId: id, error: error?.message });
        return res.status(500).json({ success: false, error: 'Failed to create download URL' } as ErrorResponse);
      }

      const safeName = sanitizeDownloadName({
        id: row.id,
        original_filename: row.original_filename,
        filename: row.filename,
      });

      const signedUrl = new URL(data.signedUrl);
      signedUrl.searchParams.set('download', safeName);

      return res.redirect(302, signedUrl.toString());
    } catch (err) {
      const error = err as Error;
      logger.error('Error in GET /photos/:id/original', error);
      return res.status(500).json({ success: false, error: 'Original download failed' } as ErrorResponse);
    }
  });

  // ============================================================================
  // GET /:id/thumbnail-url - Generate signed thumbnail URL
  // ============================================================================
  router.get('/:id/thumbnail-url', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const reqId = req.id || req.headers['x-request-id'] as string || 'unknown';

    try {
      const { id } = req.params;

      const photo = await photosDb.getPhotoByAnyId(id, req.user!.id);

      if (!photo) {
        logger.warn('Thumbnail URL request for non-existent or unauthorized photo', {
          reqId,
          photoId: id,
          userId: req.user!.id
        });
        return res.status(404).json({ success: false, error: 'Photo not found' } as ErrorResponse);
      }

      if (!photo.hash) {
        logger.debug('Thumbnail URL request for photo without hash (normal case)', {
          reqId,
          photoId: id,
          filename: photo.filename
        });
        return res.status(200).json({
          success: true,
          url: null,
          expiresAt: null,
          hasThumbnail: false
        } as ThumbnailUrlResponse);
      }

      const { sig, exp } = signThumbnailUrl(photo.hash, DEFAULT_TTL_SECONDS);
      const signedUrl = `/display/thumbnails/${photo.hash}.jpg?sig=${encodeURIComponent(sig)}&exp=${exp}`;

      logger.info('Generated signed thumbnail URL', {
        reqId,
        photoId: id,
        userId: req.user!.id,
        expiresAt: new Date(exp * 1000).toISOString()
      });

      return res.json({
        success: true,
        url: signedUrl,
        expiresAt: exp,
        hasThumbnail: true
      } as ThumbnailUrlResponse);

    } catch (err) {
      const error = err as Error;
      logger.error('Error generating thumbnail URL', {
        reqId,
        photoId: req.params.id,
        userId: req.user?.id,
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({ success: false, error: 'Internal server error' } as ErrorResponse);
    }
  });

  // ============================================================================
  // PATCH /:id/metadata - Update photo metadata
  // ============================================================================
  router.patch('/:id/metadata', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    try {
      const resolvedId = await photosDb.resolvePhotoPrimaryId(id, req.user!.id);
      if (!resolvedId) {
        return res.status(404).json({ success: false, error: 'Photo not found' } as ErrorResponse);
      }

      const photo = await photosDb.getPhotoById(resolvedId, req.user!.id);
      if (!photo) {
        return res.status(404).json({ success: false, error: 'Photo not found' } as ErrorResponse);
      }

      const { caption, description, keywords, textStyle } = (req.body || {}) as MetadataUpdateBody;
      if (
        caption === undefined &&
        description === undefined &&
        keywords === undefined &&
        textStyle === undefined
      ) {
        return res.status(400).json({ success: false, error: 'No metadata fields provided' } as ErrorResponse);
      }

      const updated = await photosDb.updatePhotoMetadata(resolvedId, req.user!.id, { caption, description, keywords, textStyle });
      let parsedTextStyle: TextStyle | null = null;
      if (textStyle !== undefined && textStyle !== null) {
        try { parsedTextStyle = textStyle; } catch { logger.warn('Failed to parse text_style after update for photo', id); }
      }

      res.json({
        success: !!updated,
        metadata: {
          caption: caption !== undefined ? caption : photo.caption,
          description: description !== undefined ? description : photo.description,
          keywords: keywords !== undefined ? keywords : photo.keywords,
          textStyle: parsedTextStyle,
        }
      });
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to update metadata for photo', id, error);
      res.status(500).json({ success: false, error: error.message || 'Failed to update metadata' } as ErrorResponse);
    }
  });

  // ============================================================================
  // PATCH /:id/revert - Revert edited image
  // ============================================================================
  router.patch('/:id/revert', authenticateToken, express.json(), async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    try {
      const resolvedId = await photosDb.resolvePhotoPrimaryId(id, req.user!.id);
      if (!resolvedId) {
        return res.status(404).json({ success: false, error: 'Photo not found' } as ErrorResponse);
      }

      const row = await photosDb.getPhotoById(resolvedId, req.user!.id);
      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' } as ErrorResponse);
      }
      if (!row.edited_filename) {
        return res.status(400).json({ success: false, error: 'No edited version to revert' } as ErrorResponse);
      }

      const editedPath = `inprogress/${row.edited_filename}`;
      const { error: deleteError } = await photosStorage.deletePhotos([editedPath]);

      if (deleteError) {
        logger.warn('Failed to delete edited file from Supabase storage:', deleteError);
      }

      await photosDb.updatePhotoEditedFilename(resolvedId, req.user!.id, null);
      res.json({ success: true });
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to revert photo', id, error);
      res.status(500).json({ success: false, error: error.message || 'Failed to revert' } as ErrorResponse);
    }
  });

  // ============================================================================
  // DELETE /:id - Delete photo
  // ============================================================================
  router.delete(
    '/:id',
    authenticateToken,
    validateRequest({ params: photoIdParamsSchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.validated!.params!;
        const resolvedId = await photosDb.resolvePhotoPrimaryId(id, req.user!.id);
        if (!resolvedId) {
          return res.status(404).json({ success: false, error: 'Photo not found' } as ErrorResponse);
        }

        const row = await photosDb.getPhotoById(resolvedId, req.user!.id);
        if (!row) {
          return res.status(404).json({ success: false, error: 'Photo not found' } as ErrorResponse);
        }

        const deleteList = buildDeleteList(row);

        // Storage deletion MUST succeed before deleting the DB row.
        for (const objectPath of deleteList) {
          const { error: deleteError } = await photosStorage.deletePhotos([objectPath]);
          if (deleteError) {
            logger.warn('[photos/delete] Storage delete failed; aborting DB delete', {
              photoId: resolvedId,
              requestedId: id,
              objectPath,
              error: deleteError?.message || String(deleteError),
            });
            return res
              .status(500)
              .json({ success: false, error: 'Failed to delete photo from storage. Please retry.' } as ErrorResponse);
          }
        }

        const deleted = await photosDb.deletePhoto(resolvedId, req.user!.id);
        if (!deleted) {
          return res.status(404).json({ success: false, error: 'Photo not found' } as ErrorResponse);
        }

        return res.json({ success: true, message: 'Photo deleted successfully' });
      } catch (err) {
        const error = err as Error;
        logger.error('Delete photo error:', error);
        return res.status(500).json({ success: false, error: error.message } as ErrorResponse);
      }
    },
  );

  // ============================================================================
  // PATCH /:id/state - Transition photo state
  // ============================================================================
  router.patch('/:id/state', authenticateToken, express.json(), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { state } = req.body as StateTransitionBody;
      if (!['working', 'inprogress', 'finished'].includes(state)) {
        return res.status(400).json({ success: false, error: 'Invalid state' } as ErrorResponse);
      }
      const row = await photosDb.getPhotoByAnyId(id, req.user!.id);
      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' } as ErrorResponse);
      }
      if (row.state !== state) {
        const result = await photosState.transitionState(row.id, req.user!.id, row.state, state, row.filename, row.storage_path);
        if (!result.success) {
          return res.status(500).json({ success: false, error: result.error, error_details: result.error_details } as ErrorResponse);
        }
      }
      if (state === 'inprogress') {
        try {
          await photosAi.enqueuePhotoAiJob(row.id, { requestId: req.requestId });
        } catch (err) {
          const error = err as Error;
          logger.error('Failed to enqueue AI job:', error?.message);
        }
        return res.status(202).json({ success: true, status: 'processing', message: 'AI processing has been queued.' });
      }
      res.json({ success: true });
    } catch (err) {
      const error = err as Error;
      logger.error('State update error:', error);
      res.status(500).json({ success: false, error: error.message } as ErrorResponse);
    }
  });

  // ============================================================================
  // POST /save-captioned-image - Save edited image with captions
  // ============================================================================
  router.post('/save-captioned-image', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const { photoId, dataURL, caption, description, keywords, textStyle } = (req.body || {}) as SaveCaptionedImageBody;
    if (!photoId) return res.status(400).json({ success: false, error: 'photoId is required' } as ErrorResponse);

    try {
      const result = await saveCaptionedImageWorkflow({
        photoId,
        userId: req.user!.id,
        dataURL,
        caption,
        description,
        keywords,
        textStyle,
        photosDb,
        photosStorage,
        photosImage,
        logger,
      });

      let parsedTextStyle: TextStyle | null = null;
      if (result.textStyleJson) {
        try { parsedTextStyle = JSON.parse(result.textStyleJson); } catch { logger.warn('Failed to parse text_style after save for photo', photoId); }
      }

      res.json({
        success: true,
        id: photoId,
        filename: result.photo.filename,
        editedFilename: result.editedFilename,
        state: result.photo.state,
        caption: result.caption,
        description: result.description,
        keywords: result.keywords,
        textStyle: parsedTextStyle,
        hash: result.hash,
        fileSize: result.fileSize,
        metadata: result.metadata,
        storagePath: result.editedPath,
      });
    } catch (err) {
      const error = err as Error;
      const badRequestErrors = new Set([
        'Invalid image dataURL',
        'Unsupported data URL format',
        'Unable to decode image data',
        'Image data is empty',
      ]);

      if (badRequestErrors.has(error.message)) {
        return res.status(400).json({ success: false, error: error.message } as ErrorResponse);
      }
      if (error.message === 'Photo not found') {
        return res.status(404).json({ success: false, error: error.message } as ErrorResponse);
      }

      logger.error('Failed to save captioned image for photo', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to save captioned image' } as ErrorResponse);
    }
  });

  // ============================================================================
  // POST /:id/recheck-ai - Re-run AI analysis
  // ============================================================================
  router.post('/:id/recheck-ai', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isAiEnabled()) {
        return res.status(503).json({ success: false, error: 'AI is disabled. Set AI_ENABLED=true (or ENABLE_AI=true) to enable.' } as ErrorResponse);
      }

      const photo = await photosDb.getPhotoByAnyId(req.params.id, req.user!.id);
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      await reextractMetadataWorkflow({
        photo,
        userId: req.user!.id,
        photosDb,
        logger,
        strict: false,
      });

      const body = req.body as AiRecheckBody;
      const modelOverride = body?.model || (req.query?.model as string) || null;
      const collectibleOverride = body?.collectibleOverride || null;
      if (modelOverride && !photosAi.isModelAllowed(modelOverride)) {
        return res.status(400).json({ success: false, error: 'Unsupported model override', allowedModels: MODEL_ALLOWLIST } as ErrorResponse);
      }
      if (modelOverride === 'gpt-image-1') {
        return res.status(400).json({ success: false, error: 'gpt-image-1 is an image-generation model and cannot be used for text analysis. Choose a vision-analysis model (e.g., gpt-4o-mini).' } as ErrorResponse);
      }
      const jobOptions: { modelOverrides?: Record<string, string>; collectibleOverride?: Record<string, unknown>; requestId?: string } = {
        requestId: req.requestId,
      };
      if (modelOverride) jobOptions.modelOverrides = { router: modelOverride, scenery: modelOverride, collectible: modelOverride };
      if (collectibleOverride) {
        if (typeof collectibleOverride !== 'object' || typeof collectibleOverride.id !== 'string' || !collectibleOverride.id.trim()) {
          return res.status(400).json({ success: false, error: 'collectibleOverride must be an object with a non-empty string id' } as ErrorResponse);
        }
        jobOptions.collectibleOverride = collectibleOverride;
      }
      try {
        await photosAi.enqueuePhotoAiJob(photo.id, jobOptions);
      } catch (err) {
        const error = err as Error;
        logger.error('Failed to enqueue AI recheck job:', error?.message);
      }
      return res.status(202).json({ message: 'AI recheck queued (metadata re-extracted).', photoId: photo.id });
    } catch (err) {
      const error = err as Error;
      logger.error('Error processing AI recheck:', error);
      return res.status(500).json({ error: 'Failed to process AI recheck' });
    }
  });

  // ============================================================================
  // POST /:id/reextract-metadata - Re-extract EXIF metadata
  // ============================================================================
  router.post('/:id/reextract-metadata', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const photo = await photosDb.getPhotoByAnyId(req.params.id, req.user!.id);
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      const merged = await reextractMetadataWorkflow({
        photo,
        userId: req.user!.id,
        photosDb,
        logger,
        strict: true,
      });

      return res.status(200).json({
        message: 'Metadata re-extracted successfully',
        photoId: photo.id,
        hasGPS: !!(merged?.latitude && merged?.longitude),
        hasHeading: !!(merged?.GPSImgDirection || merged?.GPS?.imgDirection)
      });
    } catch (err) {
      const error = err as Error;
      if (error.message === 'Failed to download photo from storage') {
        return res.status(500).json({ error: error.message });
      }
      if (error.message === 'Failed to extract metadata') {
        return res.status(500).json({ error: error.message });
      }
      logger.error('Error re-extracting metadata:', error);
      return res.status(500).json({ error: 'Failed to re-extract metadata' });
    }
  });

  // ============================================================================
  // POST /:id/run-ai - Queue AI processing
  // ============================================================================
  router.post('/:id/run-ai', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isAiEnabled()) {
        return res.status(503).json({ success: false, error: 'AI is disabled. Set AI_ENABLED=true (or ENABLE_AI=true) to enable.' } as ErrorResponse);
      }

      const photo = await photosDb.getPhotoByAnyId(req.params.id, req.user!.id);
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }
      const body = req.body as AiRecheckBody;
      const modelOverride = body?.model || (req.query?.model as string) || null;
      if (modelOverride && !photosAi.isModelAllowed(modelOverride)) {
        return res.status(400).json({ success: false, error: 'Unsupported model override', allowedModels: MODEL_ALLOWLIST } as ErrorResponse);
      }
      if (modelOverride === 'gpt-image-1') {
        return res.status(400).json({ success: false, error: 'gpt-image-1 is an image-generation model and cannot be used for text analysis. Choose a vision-analysis model (e.g., gpt-4o-mini).' } as ErrorResponse);
      }
      const jobOptions: { modelOverrides?: Record<string, string>; requestId?: string } = { requestId: req.requestId };
      if (modelOverride) jobOptions.modelOverrides = { router: modelOverride, scenery: modelOverride, collectible: modelOverride };
      await photosAi.enqueuePhotoAiJob(photo.id, jobOptions);
      return res.status(202).json({
        message: 'AI processing has been queued.',
        photoId: photo.id,
      });
    } catch (err) {
      const error = err as Error;
      logger.error('Error processing AI job:', error);
      return res.status(500).json({ error: 'Failed to process AI job' });
    }
  });

  // ============================================================================
  // GET /display/:state/:filename - Serve images from storage
  // ============================================================================
  router.get('/display/:state/:filename', authenticateImageRequest, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { state, filename } = req.params;
      const IMAGE_CACHE_MAX_AGE = parseInt(process.env.IMAGE_CACHE_MAX_AGE || '31536000', 10);

      if (state === 'thumbnails') {
        const storagePath = `thumbnails/${filename}`;
        const { data, error } = await photosStorage.downloadPhoto(storagePath);
        if (error) {
          logger.error('❌ Thumbnail download error:', error, { filename });
          return res.status(404).json({ error: 'Thumbnail not found in storage' });
        }
        const stream = Readable.from(data.stream());
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}, immutable`);
        stream.pipe(res);
        return;
      }

      const photo = await photosDb.getPhotoByFilenameAndState(filename, state, req.user!.id);

      if (!photo) {
        logger.error('Display endpoint 404: Photo not found', { filename, state });
        return res.status(404).json({ error: 'Photo not found' });
      }

      const storagePath = photo.storage_path || `${state}/${filename}`;
      const { data, error } = await photosStorage.downloadPhoto(storagePath);
      if (error) {
        logger.error('Supabase download error:', error, { filename, state });
        return res.status(404).json({ error: 'File not found in storage' });
      }

      const ext = path.extname(filename).toLowerCase();
      let contentType = 'image/jpeg';
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.heic' || ext === '.heif') contentType = 'image/heic';

      let etag = photo.hash || (photo.file_size ? `${photo.file_size}` : '') + (photo.updated_at ? `-${photo.updated_at}` : '');
      if (etag) res.set('ETag', etag);
      res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}, immutable`);

      if (ext === '.heic' || ext === '.heif') {
        try {
          const buffer = await data.arrayBuffer();
          const fileBuffer = Buffer.from(buffer);
          const jpegBuffer = await photosImage.convertHeicToJpeg(fileBuffer);
          res.set('Content-Type', 'image/jpeg');
          res.send(jpegBuffer);
        } catch (conversionError) {
          logger.error('HEIC conversion error:', conversionError, { filename });
          res.status(500).json({ error: 'Failed to convert HEIC image' });
        }
      } else {
        const stream = Readable.from(data.stream());
        res.set('Content-Type', contentType);
        stream.pipe(res);
      }

    } catch (err) {
      logger.error('Display endpoint error:', err, { filename: req?.params?.filename });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Debug: list registered routes
  try {
    const routes = (router.stack || []).filter(Boolean).map((s: { route?: { path?: string; stack?: Array<{ method?: string }> }; name?: string }) => {
      try {
        return s.route
          ? (s.route.path || (s.route.stack?.[0]?.method ? `${s.route.stack[0].method} ${s.route.path}` : s.route.path))
          : (s.name || 'middleware');
      } catch { return 'unknown'; }
    });
    logger.info('[routes] photos router routes:', routes);
  } catch (e) {
    const error = e as Error;
    logger.warn('[routes] failed to enumerate photos router routes', error?.message);
  }

  return router;
}

// Also export for CommonJS compatibility
module.exports = createPhotosRouter;
