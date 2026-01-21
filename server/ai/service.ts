import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Knex } from 'knex';

import '../env';
import logger from '../logger';
import auditLogger from './langgraph/audit_logger';
import openai from './openaiClient';
import { convertHeicToJpegBuffer } from '../media/image';
import sharp from 'sharp';
import exifr from 'exifr';

import supabase from '../lib/supabaseClient';
import { AnalysisResultSchema } from './schemas';
import {
  buildMetadataKeywordParts,
  dmsArrayToDecimal,
  extractLatLon,
  getBestCaptureDate,
  mergeKeywordStrings,
  normalizeDegrees,
  toNumber,
  type LatLon,
  type MetadataRecord,
} from './metadata';
import { generateCaptionFallback, generateKeywordsFallback } from './keywordFallbacks';

const { app: aiGraph } = require('./langgraph/graph');

const allowDevDebug = process.env.ALLOW_DEV_DEBUG === 'true';

if (!process.env.OPENAI_API_KEY) {
  if (process.env.NODE_ENV === 'test') {
    logger.warn('OPENAI_API_KEY not set — skipping fail-fast in test environment.');
  } else {
    throw new Error('OPENAI_API_KEY not set in .env');
  }
}

export type CollectibleOverrideInput = {
  id?: unknown;
  category?: unknown;
  confirmedBy?: unknown;
  fields?: unknown;
};

export type CollectibleOverride = {
  id: string;
  category: string | null;
  fields: unknown;
  confirmedBy: string | null;
};

export type ProcessPhotoAIOptions = {
  fileBuffer: Buffer;
  filename: string;
  metadata?: MetadataRecord | string | null;
  gps?: string | null;
  device?: string | null;
  isRecheck?: boolean;
  collectibleOverride?: CollectibleOverrideInput | null;
};

export type ModelOverrides = Record<string, unknown>;

type CollectibleInsights = {
  review?: { status?: string };
  specifics?: Record<string, unknown>;
  category?: string | null;
  condition?: { rank?: number | null; label?: string | null };
  valuation?: {
    lowEstimateUSD?: number | null;
    highEstimateUSD?: number | null;
    market_data?: Array<{
      price?: number;
      venue?: unknown;
      url?: unknown;
      date_seen?: unknown;
      condition_label?: unknown;
    }>;
  };
};

function sanitizeCollectibleOverride(input: CollectibleOverrideInput | null | undefined): CollectibleOverride | null {
  if (!input || typeof input !== 'object') return null;
  const rawId = typeof input.id === 'string' ? input.id.trim() : '';
  if (!rawId) return null;

  const id = rawId.slice(0, 200);
  const category = typeof input.category === 'string' && input.category.trim()
    ? input.category.trim().slice(0, 80)
    : null;
  const confirmedBy = typeof input.confirmedBy === 'string' && input.confirmedBy.trim()
    ? input.confirmedBy.trim().slice(0, 80)
    : null;
  const fields = input.fields !== undefined ? input.fields : null;

  return { id, category, fields, confirmedBy };
}

export async function processPhotoAI(
  { fileBuffer, filename, metadata, gps, device, isRecheck = false, collectibleOverride = null }: ProcessPhotoAIOptions,
  modelOverrides: ModelOverrides = {},
) {
  let imageBuffer: Buffer;
  let imageMime: string;
  const ext = path.extname(filename).toLowerCase();
  logger.debug(`[AI Debug] [processPhotoAI] Starting for filename: ${filename}`);
  if (ext === '.heic' || ext === '.heif') {
    imageBuffer = await convertHeicToJpegBuffer(fileBuffer, 95);
    imageMime = 'image/jpeg';
    if (allowDevDebug && process.env.NODE_ENV !== 'production') {
      try {
        const os = require('os');
        const debugDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-app-ai-debug-'));
        const debugPath = path.join(debugDir, `${crypto.randomUUID()}.jpg`);
        const fd = fs.openSync(debugPath, 'wx', 0o600);
        try {
          fs.writeFileSync(fd, imageBuffer);
        } finally {
          try {
            fs.closeSync(fd);
          } catch {
            // ignore
          }
        }
        logger.debug(`[Graph Debug] Saved intermediate JPEG buffer to ${debugPath}`);
      } catch (e: unknown) {
        logger.error(`[Graph Debug] Failed to write debug image: ${(e as Error)?.message || String(e)}`);
      }
    }
  } else {
    imageBuffer = fileBuffer;
    imageMime = ext === '.png' ? 'image/png' : 'image/jpeg';
  }
  const imageBase64 = imageBuffer.toString('base64');
  logger.debug('[Graph] Prepared image buffer for graph invocation', { filename, imageMime });
  logger.debug(`[Graph Debug] imageMime before graph: ${imageMime}`);
  logger.debug('[AI Debug] [processPhotoAI] Prepared graph invocation', {
    filename,
    imageMime,
    imageBase64Length: imageBase64.length,
    hasMetadata: Boolean(metadata && (typeof metadata === 'string' ? metadata.trim().length : Object.keys(metadata).length)),
    hasGps: Boolean(gps),
    hasDevice: Boolean(device),
    modelOverrideKeys: Object.keys(modelOverrides || {}),
  });

  let meta: MetadataRecord = {};
  if (typeof metadata === 'string' && metadata) {
    try {
      meta = JSON.parse(metadata) as MetadataRecord;
    } catch (parseErr: unknown) {
      logger.warn('[AI] Failed to parse metadata string; using empty metadata.', (parseErr as Error)?.message || parseErr);
      meta = {};
    }
  } else if (metadata && typeof metadata === 'object') {
    meta = metadata as MetadataRecord;
  }

  const captureDate = getBestCaptureDate(meta);
  const deviceModel = meta.Make && meta.Model
    ? `${meta.Make} ${meta.Model}`
    : (meta.Model || meta.Make || null);

  const normalizedForLLM: MetadataRecord = {
    ...meta,
    dateTime: captureDate ? captureDate.toISOString() : null,
    cameraModel: deviceModel || null,
  };

  const runId = crypto.randomUUID();
  const sanitizedOverride = sanitizeCollectibleOverride(collectibleOverride);
  const initialState = {
    runId,
    filename,
    fileBuffer,
    imageBase64,
    imageMime,
    metadata: normalizedForLLM,
    gpsString: gps || null,
    device: device || null,
    modelOverrides: modelOverrides || {},
    collectibleOverride: sanitizedOverride,
    classification: null,
    poiAnalysis: null,
    rich_search_context: null,
    finalResult: null,
    error: null,
  };

  logger.debug('[Graph] metadata sent to LLM (keys):', Object.keys(normalizedForLLM));
  logger.debug('[Graph] dateTime sent:', normalizedForLLM.dateTime, 'cameraModel:', normalizedForLLM.cameraModel);
  logger.info('[GPS] pre-graph gpsString = %s', initialState.gpsString);

  try {
    const sanitizedInitial = { ...initialState } as Record<string, unknown>;
    if (sanitizedInitial.fileBuffer && Buffer.isBuffer(sanitizedInitial.fileBuffer)) {
      sanitizedInitial.fileBuffer = `[Buffer length: ${sanitizedInitial.fileBuffer.length || 'unknown'}]`;
    }
    if (sanitizedInitial.imageBase64) sanitizedInitial.imageBase64 = '[omitted]';
    logger.info(
      '[Graph] Initial state for %s: keys=%s classification=%s gps=%s',
      filename || '<unknown>',
      Object.keys(sanitizedInitial).join(','),
      sanitizedInitial.classification || '<none>',
      sanitizedInitial.gpsString || '<none>',
    );
    const runType = isRecheck ? 'Recheck' : 'Standard';
    auditLogger.logGraphStart(runId, sanitizedInitial, runType);
  } catch (err: unknown) {
    logger.warn('[Graph] Failed to log initial state for %s', filename, (err as Error)?.message || err);
  }

  logger.info(`[Graph] Invoking graph for ${filename}...`);
  let finalState: Record<string, unknown>;
  try {
    finalState = await aiGraph.invoke(initialState);
    auditLogger.logGraphEnd(runId, finalState);
  } catch (graphError: unknown) {
    auditLogger.logError(runId, 'Graph Invocation', graphError);
    throw graphError;
  }

  logger.debug('[AI Debug] [processPhotoAI] aiGraph.invoke returned', {
    hasFinalResult: Boolean(finalState && finalState.finalResult),
    classificationType: (finalState.classification as { type?: string } | undefined)?.type || null,
    error: finalState && finalState.error ? String(finalState.error).slice(0, 200) : null,
  });
  try {
    const sanitizedFinal = { ...finalState } as Record<string, unknown>;
    if (sanitizedFinal.fileBuffer && Buffer.isBuffer(sanitizedFinal.fileBuffer)) {
      sanitizedFinal.fileBuffer = `[Buffer length: ${sanitizedFinal.fileBuffer.length || 'unknown'}]`;
    }
    if (sanitizedFinal.imageBase64) sanitizedFinal.imageBase64 = '[omitted]';
    const poiSummary = {
      nearbyPlaces: ((sanitizedFinal.poiCache as { nearbyPlaces?: unknown[] } | undefined)?.nearbyPlaces || []).length,
      nearbyFood: ((sanitizedFinal.poiCache as { nearbyFood?: unknown[] } | undefined)?.nearbyFood || []).length,
      osmTrails: ((sanitizedFinal.poiCache as { osmTrails?: unknown[] } | undefined)?.osmTrails || []).length,
    };
    const finalSummary = {
      classification: sanitizedFinal.classification || null,
      hasFinalResult: Boolean(sanitizedFinal.finalResult),
      finalKeys: sanitizedFinal.finalResult ? Object.keys(sanitizedFinal.finalResult as Record<string, unknown>) : [],
      poiSummary,
    };
    if (allowDevDebug) {
      logger.info('[Graph] Final summary for %s: %s', filename || '<unknown>', JSON.stringify(finalSummary));
    } else {
      logger.debug('[Graph] Final summary for %s: %s', filename || '<unknown>', JSON.stringify(finalSummary));
    }
  } catch (err: unknown) {
    logger.warn('[Graph] Failed to log final state for %s', filename, (err as Error)?.message || err);
  }

  if (finalState.error) {
    logger.error(`[AI Debug] [processPhotoAI] aiGraph.invoke error: ${finalState.error}`);
    throw new Error(`AI Graph processing failed: ${finalState.error}`);
  }
  if (!finalState.finalResult) {
    logger.error('[AI Debug] [processPhotoAI] aiGraph.invoke finished but produced no finalResult.');
    throw new Error('AI Graph finished but produced no finalResult.');
  }

  const rawResult = {
    ...(finalState.finalResult as Record<string, unknown>),
    classification: finalState.classification,
    poiAnalysis: finalState.poiAnalysis,
    collectibleInsights: (finalState.finalResult as { collectibleInsights?: unknown } | undefined)?.collectibleInsights
      ? (finalState.finalResult as { collectibleInsights?: unknown }).collectibleInsights
      : finalState.collectibleInsights,
  };

  const validation = AnalysisResultSchema.safeParse(rawResult);
  if (!validation.success) {
    logger.error('[AI Validation] Schema validation failed', {
      errors: validation.error.format(),
      rawResult: JSON.stringify(rawResult).slice(0, 1000),
    });
    throw new Error(`AI Validation Failed: ${validation.error.message}`);
  }

  const result = validation.data as Record<string, unknown>;

  logger.info('[AI Result] caption:', result.caption);
  logger.info('[AI Result] description (truncated):', String(result.description || '').slice(0, 300));
  logger.info('[AI Result] keywords:', result.keywords);

  return result;
}

export async function updatePhotoAIMetadata(
  db: Knex,
  photoRow: Record<string, unknown>,
  storagePath: string,
  modelOverrides: ModelOverrides = {},
  options: { collectibleOverride?: CollectibleOverrideInput } = {},
) {
  try {
    logger.debug('[AI Debug] [updatePhotoAIMetadata] Called with', {
      photoId: photoRow.id,
      filename: photoRow.filename,
      storagePath,
      modelOverrideKeys: Object.keys(modelOverrides || {}),
    });
    const meta = JSON.parse((photoRow.metadata as string) || '{}') as MetadataRecord;
    logger.debug('[AI Debug] [updatePhotoAIMetadata] Parsed metadata keys', Object.keys(meta));

    const coords = extractLatLon(meta);
    let gps = '';
    if (coords && typeof coords.lat === 'number' && typeof coords.lon === 'number') {
      gps = `${coords.lat.toFixed(6)},${coords.lon.toFixed(6)}`;
      if (process.env.DEBUG_GPS === '1') {
        logger.info('[GPS] set gpsString from %s → %s', coords.source, gps);
      }
    } else if (process.env.DEBUG_GPS === '1') {
      logger.info('[GPS] no coords extracted (source=%s)', coords && coords.source);
    }
    if (process.env.DEBUG_GPS === '1') {
      logger.info('[GPS] DB metadata GPS fields', {
        latitude: meta.latitude,
        longitude: meta.longitude,
        GPSLatitude: meta.GPSLatitude,
        GPSLongitude: meta.GPSLongitude,
        GPSLatitudeRef: meta.GPSLatitudeRef,
        GPSLongitudeRef: meta.GPSLongitudeRef,
        nestedKeys: Object.keys((meta.GPS || meta.GPSInfo || {}) as Record<string, unknown>).slice(0, 20),
      });
    }

    let device = meta.Make && meta.Model ? `${meta.Make} ${meta.Model}` : '';
    const retryCount = (photoRow.ai_retry_count as number) || 0;
    if (retryCount >= 5) {
      logger.error(`AI processing failed permanently for ${photoRow.filename} after ${retryCount} retries`);
      await db('photos').where({ id: photoRow.id }).update({
        caption: 'AI processing failed',
        description: 'AI processing failed',
        keywords: '',
        ai_retry_count: retryCount,
        poi_analysis: null,
      });
      logger.debug('[AI Debug] [updatePhotoAIMetadata] Marked as permanently failed in DB.');
      return null;
    }

    let ai: Record<string, unknown> | null;
    let enrichedMeta: MetadataRecord | undefined;
    try {
      logger.debug('[AI Debug] [updatePhotoAIMetadata] Creating signed URL for streaming:', storagePath);

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('photos')
        .createSignedUrl(storagePath, 60);

      if (signedUrlError) {
        throw new Error(`Failed to create signed URL: ${signedUrlError.message}`);
      }

      logger.debug('[AI Debug] [updatePhotoAIMetadata] Fetching stream from signed URL...');

      const signedUrl = signedUrlData.signedUrl;

      if (!signedUrl || typeof signedUrl !== 'string') {
        throw new Error('Invalid signed URL: not a string');
      }

      const config = require('../config/env').getConfig();
      const supabaseUrl = config?.supabase?.url || process.env.SUPABASE_URL || '';

      if (supabaseUrl) {
        try {
          const url = new URL(signedUrl);
          const expectedOrigin = new URL(supabaseUrl).origin;
          if (url.origin !== expectedOrigin) {
            throw new Error(`Signed URL origin mismatch: expected ${expectedOrigin}, got ${url.origin}`);
          }
        } catch (err: unknown) {
          if ((err as Error)?.message && (err as Error).message.includes('origin mismatch')) {
            throw err;
          }
          throw new Error(`Invalid signed URL format: ${(err as Error)?.message || String(err)}`);
        }
      }

      const response = await fetch(signedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file stream: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const originalBuffer = Buffer.from(arrayBuffer);

      let richMetadata: {
        created_at: unknown;
        gps: { lat: number; lon: number; alt: number | null; direction: number | null } | null;
        device: { make: string | null; model: string | null; lens: string | null } | null;
        exposure: { iso: number | null; f_stop: number | null; shutter_speed: number | null; flash_fired: boolean | null } | null;
        user_comment?: unknown;
      } | null = null;

      try {
        logger.debug('[AI Debug] [updatePhotoAIMetadata] Extracting metadata from original buffer...');
        const exif = await exifr.parse(originalBuffer, {
          tiff: true,
          ifd0: true,
          exif: true,
          gps: true,
          xmp: true,
          icc: true,
          iptc: true,
          translateKeys: true,
          translateValues: true,
        } as unknown as Record<string, unknown>);

        if (exif && typeof exif === 'object') {
          const latRaw = (exif as MetadataRecord).GPSLatitude ?? (exif as MetadataRecord).latitude;
          const lonRaw = (exif as MetadataRecord).GPSLongitude ?? (exif as MetadataRecord).longitude;
          const lat = dmsArrayToDecimal(latRaw, (exif as MetadataRecord).GPSLatitudeRef);
          const lon = dmsArrayToDecimal(lonRaw, (exif as MetadataRecord).GPSLongitudeRef);

          richMetadata = {
            created_at: (exif as MetadataRecord).DateTimeOriginal
              || (exif as MetadataRecord).CreateDate
              || (exif as MetadataRecord).DateCreated
              || (exif as MetadataRecord).DateTimeDigitized
              || (exif as MetadataRecord).ModifyDate
              || null,
            gps: typeof lat === 'number' && typeof lon === 'number'
              ? {
                lat,
                lon,
                alt: toNumber((exif as MetadataRecord).GPSAltitude),
                direction: normalizeDegrees(toNumber((exif as MetadataRecord).GPSImgDirection ?? (exif as MetadataRecord).GPSDestBearing)),
              }
              : null,
            device: {
              make: (exif as MetadataRecord).Make ? String((exif as MetadataRecord).Make) : null,
              model: (exif as MetadataRecord).Model ? String((exif as MetadataRecord).Model) : null,
              lens: (exif as MetadataRecord).LensModel
                ? String((exif as MetadataRecord).LensModel)
                : ((exif as MetadataRecord).Lens ? String((exif as MetadataRecord).Lens) : null),
            },
            exposure: {
              iso: toNumber((exif as MetadataRecord).ISO),
              f_stop: toNumber((exif as MetadataRecord).FNumber),
              shutter_speed: toNumber((exif as MetadataRecord).ExposureTime),
              flash_fired: (exif as MetadataRecord).Flash != null
                ? Boolean(toNumber((exif as MetadataRecord).Flash))
                : null,
            },
          };

          logger.debug('[AI Debug] [updatePhotoAIMetadata] Extracted rich metadata (buffer):', {
            hasCreatedAt: Boolean(richMetadata.created_at),
            hasGps: Boolean(richMetadata.gps),
            hasDevice: Boolean(richMetadata.device && (richMetadata.device.make || richMetadata.device.model)),
            hasExposure: Boolean(richMetadata.exposure && richMetadata.exposure.iso),
          });
        }
      } catch (metaErr: unknown) {
        logger.error('[Metadata Debug] Failed to extract metadata:', (metaErr as Error)?.message || metaErr, (metaErr as Error)?.stack);
      }

      let fileBuffer: Buffer;
      const isHeic = String(photoRow.filename || '').toLowerCase().endsWith('.heic')
        || String(photoRow.filename || '').toLowerCase().endsWith('.heif');

      if (isHeic) {
        logger.debug('[AI Debug] [updatePhotoAIMetadata] Detected HEIC file, converting to JPEG...');

        const jpegBuffer = await convertHeicToJpegBuffer(originalBuffer);

        fileBuffer = await sharp(jpegBuffer)
          .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true })
          .withMetadata()
          .toFormat('jpeg', { quality: 95, mozjpeg: true })
          .toBuffer();
      } else {
        fileBuffer = await sharp(originalBuffer)
          .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true })
          .withMetadata()
          .toFormat('jpeg', { quality: 95, mozjpeg: true })
          .toBuffer();
      }

      logger.debug('[AI Debug] [updatePhotoAIMetadata] Resized file buffer loaded. Buffer length:', fileBuffer.length);

      if (richMetadata && richMetadata.gps && typeof richMetadata.gps.lat === 'number' && typeof richMetadata.gps.lon === 'number') {
        gps = `${richMetadata.gps.lat.toFixed(6)},${richMetadata.gps.lon.toFixed(6)}`;
        logger.info('[GPS] Using exiftool-extracted GPS:', gps);
      }

      if (richMetadata && richMetadata.device && richMetadata.device.make && richMetadata.device.model) {
        device = `${richMetadata.device.make} ${richMetadata.device.model}`;
        logger.info('[Device] Using exiftool-extracted device:', device);
      }

      enrichedMeta = {
        ...meta,
        ...(richMetadata && {
          DateTimeOriginal: richMetadata.created_at,
          Make: richMetadata.device?.make,
          Model: richMetadata.device?.model,
          LensModel: richMetadata.device?.lens,
          ISO: richMetadata.exposure?.iso,
          FNumber: richMetadata.exposure?.f_stop,
          ExposureTime: richMetadata.exposure?.shutter_speed,
          Flash: richMetadata.exposure?.flash_fired,
          GPSLatitude: richMetadata.gps?.lat,
          GPSLongitude: richMetadata.gps?.lon,
          GPSAltitude: richMetadata.gps?.alt,
          UserComment: richMetadata.user_comment,
        }),
      };

      const processedFilename = `${photoRow.filename}.processed.jpg`;

      const isRecheck = Boolean(photoRow.caption && String(photoRow.caption).trim() !== '' && photoRow.caption !== 'Processing...');
      if (isRecheck) {
        logger.info(`[AI Recheck] Re-processing photo with existing metadata: ${photoRow.filename}`);
      }

      ai = await processPhotoAI(
        {
          fileBuffer,
          filename: processedFilename,
          metadata: enrichedMeta,
          gps,
          device,
          isRecheck,
          collectibleOverride: options?.collectibleOverride ? options.collectibleOverride : null,
        },
        modelOverrides,
      );
      logger.debug('[AI Debug] [updatePhotoAIMetadata] processPhotoAI result keys', ai ? Object.keys(ai) : null);
    } catch (error: unknown) {
      logger.error(`AI processing failed for ${photoRow.filename} (attempt ${retryCount + 1}):`, (error as Error)?.message || error);
      if (error && (error as Error).stack) {
        logger.error('[AI Debug] Stack trace:', (error as Error).stack);
      }
      auditLogger.logError(`photo-${photoRow.id}`, `AI Processing (${photoRow.filename})`, error);
      await db('photos').where({ id: photoRow.id }).update({ ai_retry_count: retryCount + 1 });
      return null;
    }

    const keywordCount = Array.isArray(ai?.keywords)
      ? (ai?.keywords as unknown[]).filter(Boolean).length
      : typeof ai?.keywords === 'string'
        ? ai.keywords.split(',').map((v: string) => v.trim()).filter(Boolean).length
        : 0;
    logger.info('[AI Update] Retrieved AI result for %s', photoRow.filename, {
      hasCaption: Boolean(ai?.caption),
      descriptionLength: typeof ai?.description === 'string' ? ai.description.length : 0,
      keywordCount,
      hasPoiAnalysis: Boolean(ai?.poi_analysis),
    });

    const description = ai && ai.description ? String(ai.description).trim() : 'AI processing failed';

    const caption = ai && ai.caption && String(ai.caption).trim()
      ? String(ai.caption).trim()
      : generateCaptionFallback(description);

    let keywords = ai && ai.keywords && String(ai.keywords).trim()
      ? String(ai.keywords).trim()
      : generateKeywordsFallback(description);

    const finalMeta = typeof enrichedMeta !== 'undefined' ? enrichedMeta : meta;
    let finalCoords: LatLon = coords;
    if (gps && gps.includes(',')) {
      const [latStr, lonStr] = gps.split(',');
      const lat = Number(latStr);
      const lon = Number(lonStr);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        finalCoords = { lat, lon, source: 'enriched' };
      }
    }

    const metadataKeywordParts = buildMetadataKeywordParts(finalMeta, finalCoords);
    keywords = mergeKeywordStrings(keywords, metadataKeywordParts);

    await db.transaction(async (trx) => {
      const collectibleInsights = ai?.collectibleInsights as CollectibleInsights | undefined;
      const collectibleReviewStatus = collectibleInsights?.review?.status || null;
      const hasConfirmedCollectible = collectibleReviewStatus === 'confirmed';

      const extraData = collectibleInsights
        ? collectibleInsights
        : ai?.poiAnalysis
          ? ai.poiAnalysis
          : null;

      const classificationType = typeof ai?.classification === 'object'
        ? (ai.classification as { type?: string } | undefined)?.type
        : ai?.classification || null;

      const dbUpdates = {
        caption: hasConfirmedCollectible ? caption : 'Collectible (Review Needed)',
        description: hasConfirmedCollectible
          ? description
          : 'Human confirmation is required before valuation and description will be generated.',
        keywords: hasConfirmedCollectible ? keywords : 'collectible,review,pending',
        ai_retry_count: 0,
        poi_analysis: JSON.stringify(extraData || null),
        classification: classificationType,
      };
      logger.debug('[AI Debug] [updatePhotoAIMetadata] Writing AI metadata to DB (transaction).');
      await trx('photos').where({ id: photoRow.id }).update(dbUpdates);

      if (collectibleInsights && hasConfirmedCollectible) {
        const historyEntry = {
          timestamp: new Date().toISOString(),
          model: process.env.AI_COLLECTIBLE_MODEL || process.env.OPENAI_MODEL || 'unknown',
          result: collectibleInsights,
        };

        const specifics = collectibleInsights.specifics ? collectibleInsights.specifics : {};

        const collectibleRow = {
          photo_id: photoRow.id,
          user_id: photoRow.user_id,
          name: caption,
          ai_analysis_history: JSON.stringify([historyEntry]),
          specifics: JSON.stringify(specifics),
          category: collectibleInsights.category || null,
          condition_rank: collectibleInsights.condition?.rank || null,
          condition_label: collectibleInsights.condition?.label || null,
          value_min: collectibleInsights.valuation?.lowEstimateUSD || null,
          value_max: collectibleInsights.valuation?.highEstimateUSD || null,
          currency: 'USD',
          schema_version: 1,
        };

        const upsertResult = await trx('collectibles')
          .insert(collectibleRow)
          .onConflict('photo_id')
          .merge({
            ai_analysis_history: trx.raw('"collectibles"."ai_analysis_history" || ?::jsonb', [JSON.stringify([historyEntry])]),
            specifics: collectibleRow.specifics,
            category: collectibleRow.category,
            condition_rank: collectibleRow.condition_rank,
            condition_label: collectibleRow.condition_label,
            value_min: collectibleRow.value_min,
            value_max: collectibleRow.value_max,
            updated_at: new Date().toISOString(),
          })
          .returning('id');

        const collectibleId = upsertResult && upsertResult[0]
          ? (typeof upsertResult[0] === 'object' ? upsertResult[0].id : upsertResult[0])
          : null;

        logger.debug('[AI Debug] [updatePhotoAIMetadata] Upserted collectible for photo', photoRow.id, 'collectible_id:', collectibleId);

        const marketData = collectibleInsights.valuation?.market_data;
        if (collectibleId && Array.isArray(marketData) && marketData.length > 0) {
          const marketDataRecords = marketData
            .filter((item: { price?: unknown }) => item && typeof item.price === 'number' && !Number.isNaN(item.price))
            .map((item: { price: number; venue?: unknown; url?: unknown; date_seen?: unknown; condition_label?: unknown }) => ({
              collectible_id: collectibleId,
              user_id: photoRow.user_id,
              price: item.price,
              venue: item.venue ? String(item.venue).substring(0, 255) : null,
              url: item.url && typeof item.url === 'string' && item.url.length < 2048 ? item.url : null,
              date_seen: item.date_seen ? new Date(item.date_seen as string) : new Date(),
              condition_label: item.condition_label || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }));

          if (marketDataRecords.length > 0) {
            await trx('collectible_market_data').insert(marketDataRecords);
            logger.info('[AI Debug] [updatePhotoAIMetadata] Inserted %d market_data records for collectible %d', marketDataRecords.length, collectibleId);
          }
        }
      }
    });

    const saved = await db('photos').where({ id: photoRow.id }).first();
    logger.info('[AI Update] Saved DB values:', {
      caption: saved?.caption,
      description: String(saved?.description || '').slice(0, 200),
      keywords: saved?.keywords,
    });
    logger.debug('[AI Debug] [updatePhotoAIMetadata] Returning AI result keys', ai ? Object.keys(ai) : null);
    return ai;
  } catch (error: unknown) {
    logger.error(`Unexpected error in updatePhotoAIMetadata for ${photoRow.filename}:`, (error as Error)?.message || error);
    return null;
  }
}

export function isAIFailed(val: string | null | undefined): boolean {
  return !val || val.trim().toLowerCase() === 'ai processing failed';
}

export async function processAllUnprocessedInprogress(db: Knex) {
  try {
    const rows = await db('photos')
      .where('state', 'inprogress')
      .andWhere(function () {
        this.whereNull('caption')
          .orWhereNull('description')
          .orWhereNull('keywords')
          .orWhere('ai_retry_count', '<', 2);
      });

    logger.info(`[RECHECK] Found ${rows.length} inprogress files needing AI processing`);
    for (const row of rows) {
      if (
        !isAIFailed(row.caption) &&
        !isAIFailed(row.description) &&
        !isAIFailed(row.keywords) &&
        (!row.ai_retry_count || row.ai_retry_count < 2)
      ) {
        logger.info(`[RECHECK] Skipping ${row.filename} (already has valid AI metadata)`);
        continue;
      }

      const storagePath = row.storage_path || `${row.state}/${row.filename}`;
      logger.info(`[RECHECK] Processing AI metadata for ${row.filename} at ${storagePath}`);
      await updatePhotoAIMetadata(db, row, storagePath);
    }
    return rows.length;
  } catch (error: unknown) {
    logger.error('[RECHECK] Error processing unprocessed inprogress files:', error);
    throw error;
  }
}

export { openai, extractLatLon };
