'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { z } = require('zod');
const { createHash } = require('crypto');
const logger = require('../logger');
const { getRateLimitStore } = require('../middleware/rateLimitStore');
const supabase = require('../lib/supabaseClient');
const { openai } = require('../ai/openaiClient');
const { sendAdminAlert } = require('../services/sms');

const STORY_AUDIO_BUCKET = 'story-audio';
const STORY_AUDIO_PATH_PREFIX = 'architect-of-squares';
const STORY_AUDIO_CACHE_VERSION = 'v2';

const StoryAudioEnsureBodySchema = z.object({
	storySlug: z.literal(STORY_AUDIO_PATH_PREFIX),
	page: z.number().int().min(1).max(200),
	totalPages: z.number().int().min(1).max(200).optional(),
	text: z.string().trim().min(1).max(10000),
	voice: z.literal('shimmer').optional(),
});

const storyAudioTelemetry = {
	startedAtIso: new Date().toISOString(),
	ensureRequests: 0,
	cacheHits: 0,
	cacheMisses: 0,
	generationRateLimited: 0,
	generationDisabled: 0,
	generationAttempts: 0,
	generationSuccess: 0,
	generationFailure: 0,
	openAiCalls: 0,
	lastEventAtIso: null,
};

function markStoryAudioEvent() {
	storyAudioTelemetry.lastEventAtIso = new Date().toISOString();
}

function isTruthyValue(value) {
	return ['1', 'true', 'yes', 'on'].includes(value);
}

function isFalsyValue(value) {
	return ['0', 'false', 'no', 'off'].includes(value);
}

function isStoryAudioRuntimeGenerationAllowed() {
	const configured = String(process.env.STORY_AUDIO_ALLOW_RUNTIME_GENERATION || '').trim().toLowerCase();
	if (configured && isTruthyValue(configured)) return true;
	if (configured && isFalsyValue(configured)) return false;
	return process.env.NODE_ENV !== 'production';
}

function getStoryAudioTelemetrySnapshot() {
	return {
		...storyAudioTelemetry,
		runtimeGenerationAllowed: isStoryAudioRuntimeGenerationAllowed(),
	};
}

function normalizeSupabasePublicBaseUrl() {
	const base = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
	if (!base) return null;
	return base.replace(/\/$/, '');
}

function normalizeNarrationText(text) {
	return String(text || '')
		.replace(/\r\n/g, '\n')
		.replace(/\s+/g, ' ')
		.trim();
}

function buildStoryAudioContentHash({ text, totalPages, voice }) {
	const normalizedText = normalizeNarrationText(text);
	const payload = JSON.stringify({
		version: STORY_AUDIO_CACHE_VERSION,
		text: normalizedText,
		totalPages: Number(totalPages || 1),
		voice: String(voice || 'shimmer'),
	});
	return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function buildStoryAudioObjectPath({ page, text, totalPages, voice }) {
	const contentHash = buildStoryAudioContentHash({ text, totalPages, voice });
	return `${STORY_AUDIO_PATH_PREFIX}/${STORY_AUDIO_CACHE_VERSION}/page-${page}-${contentHash}.mp3`;
}

function buildStoryAudioPublicUrl(objectPath) {
	const supabaseBase = normalizeSupabasePublicBaseUrl();
	if (!supabaseBase) {
		throw new Error('SUPABASE_URL (or VITE_SUPABASE_URL) is not configured');
	}
	return `${supabaseBase}/storage/v1/object/public/${STORY_AUDIO_BUCKET}/${objectPath}`;
}

function isNotFoundError(error) {
	if (!error || typeof error !== 'object') return false;
	const message = String(error.message || '').toLowerCase();
	const statusCode = Number(error.statusCode || error.status || 0);
	return statusCode === 404 || message.includes('not found') || message.includes('does not exist');
}

function isAlreadyExistsError(error) {
	if (!error || typeof error !== 'object') return false;
	const message = String(error.message || '').toLowerCase();
	const statusCode = Number(error.statusCode || error.status || 0);
	return statusCode === 409 || message.includes('already exists') || message.includes('duplicate');
}

async function ensureStoryAudioBucketReady() {
	if (!supabase?.storage) {
		return { ok: false, reason: 'Supabase storage client is unavailable' };
	}

	try {
		const { data, error } = await supabase.storage.listBuckets();
		if (error) {
			return { ok: false, reason: `Unable to list buckets: ${error.message || String(error)}` };
		}

		const existing = Array.isArray(data)
			? data.find((entry) => entry?.name === STORY_AUDIO_BUCKET)
			: null;

		if (!existing) {
			const { error: createError } = await supabase.storage.createBucket(STORY_AUDIO_BUCKET, {
				public: true,
				allowedMimeTypes: ['audio/mpeg'],
				fileSizeLimit: '50MB',
			});

			if (createError && !isAlreadyExistsError(createError)) {
				return { ok: false, reason: `Unable to create bucket ${STORY_AUDIO_BUCKET}: ${createError.message || String(createError)}` };
			}

			return { ok: true };
		}

		if (existing.public === false && typeof supabase.storage.updateBucket === 'function') {
			const { error: updateError } = await supabase.storage.updateBucket(STORY_AUDIO_BUCKET, {
				public: true,
				allowedMimeTypes: ['audio/mpeg'],
				fileSizeLimit: '50MB',
			});
			if (updateError) {
				logger.warn('[public/story-audio] Failed to update bucket to public', {
					bucket: STORY_AUDIO_BUCKET,
					error: updateError.message || String(updateError),
				});
			}
		}

		return { ok: true };
	} catch (error) {
		return { ok: false, reason: error instanceof Error ? error.message : String(error) };
	}
}

function createStoryAudioGenerationRateLimiter() {
	const isProduction = process.env.NODE_ENV === 'production';
	const defaultMax = isProduction ? 30 : 120;
	const configuredMax = Number(process.env.STORY_AUDIO_GENERATION_LIMIT_MAX || defaultMax);
	const max = Number.isFinite(configuredMax) && configuredMax > 0 ? Math.floor(configuredMax) : defaultMax;

	const defaultWindowMs = 60 * 60 * 1000;
	const configuredWindowMs = Number(process.env.STORY_AUDIO_GENERATION_LIMIT_WINDOW_MS || defaultWindowMs);
	const windowMs = Number.isFinite(configuredWindowMs) && configuredWindowMs > 0 ? Math.floor(configuredWindowMs) : defaultWindowMs;

	return rateLimit({
		windowMs,
		max,
		store: getRateLimitStore(),
		standardHeaders: true,
		legacyHeaders: false,
		handler: (req, res) => {
			storyAudioTelemetry.generationRateLimited += 1;
			markStoryAudioEvent();
			logger.warn('[public/story-audio] Generation rate limited', {
				ip: req.ip,
				page: req.storyAudioEnsureContext?.page,
				totals: getStoryAudioTelemetrySnapshot(),
			});
			return res.status(429).json({
				success: false,
				error: 'Too many story-audio generation requests. Please try again later.',
			});
		},
		message: {
			success: false,
			error: 'Too many story-audio generation requests. Please try again later.',
		},
	});
}

function createContactRateLimiter() {
	const isProduction = process.env.NODE_ENV === 'production';

	return rateLimit({
		windowMs: 60 * 60 * 1000,
		max: isProduction ? 50 : 100,
		store: getRateLimitStore(),
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			success: false,
			error: 'Too many contact requests. Please try again later.'
		},
		validate: {
			trustProxy: false,
			xForwardedForHeader: false
		}
	});
}

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

function createPublicRouter({ db } = {}) {
	const router = express.Router();
	const contactLimiter = createContactRateLimiter();
	const storyAudioGenerationLimiter = createStoryAudioGenerationRateLimiter();

	router.post('/contact', contactLimiter, contactValidation, async (req, res) => {
		try {
			const errors = validationResult(req);
			if (!errors.isEmpty()) {
				return res.status(400).json({
					success: false,
					error: 'Validation failed',
					details: errors.array().map((e) => ({
						field: Object.prototype.hasOwnProperty.call(e, 'param') ? e.param : (Object.prototype.hasOwnProperty.call(e, 'path') ? e.path : 'unknown'),
						message: e.msg,
					})),
				});
			}

			const { name, email, subject, message } = req.body;
			const normalizedSubject = subject || 'General Inquiry';

			const [inserted] = await db('contact_messages')
				.insert({
					name,
					email,
					subject: normalizedSubject,
					message,
					ip_address: req.ip,
					status: 'new',
				})
				.returning(['id', 'created_at']);

			logger.info('[public] Contact form submitted', {
				id: inserted.id,
				email: email.substring(0, 3) + '***',
				ip: req.ip,
			});

			void sendAdminAlert(`New Contact from ${email}: ${normalizedSubject}`);

			return res.status(200).json({
				success: true,
				message: 'Thank you for your message. We will respond within 24-48 hours.',
				id: inserted.id,
			});
		} catch (error) {
			logger.error('[public] Contact form error:', error);
			return res.status(500).json({
				success: false,
				error: 'An error occurred while processing your request. Please try again later.',
			});
		}
	});

	const prepareStoryAudioEnsure = async (req, res, next) => {
		storyAudioTelemetry.ensureRequests += 1;
		markStoryAudioEvent();

		const parsed = StoryAudioEnsureBodySchema.safeParse(req.body || {});
		if (!parsed.success) {
			return res.status(400).json({ success: false, error: 'Invalid story audio request payload' });
		}

		const { page, text } = parsed.data;
		const voice = parsed.data.voice || 'shimmer';
		const totalPages = Number(parsed.data.totalPages || 1);
		const objectPath = buildStoryAudioObjectPath({ page, text, totalPages, voice });

		const ensuredBucket = await ensureStoryAudioBucketReady();
		if (!ensuredBucket.ok) {
			logger.error('[public/story-audio] Bucket setup failed', {
				page,
				bucket: STORY_AUDIO_BUCKET,
				reason: ensuredBucket.reason,
			});
			return res.status(503).json({ success: false, error: 'Story audio bucket setup failed' });
		}

		let publicUrl;
		try {
			publicUrl = buildStoryAudioPublicUrl(objectPath);
		} catch (error) {
			logger.error('[public/story-audio] Missing Supabase URL configuration', error);
			return res.status(503).json({ success: false, error: 'Story audio storage is not configured' });
		}

		try {
			const { error: existingError } = await supabase.storage.from(STORY_AUDIO_BUCKET).download(objectPath);
			if (!existingError) {
				storyAudioTelemetry.cacheHits += 1;
				markStoryAudioEvent();
				logger.info('[public/story-audio] Cache hit', {
					page,
					ip: req.ip,
					objectPath,
					totals: getStoryAudioTelemetrySnapshot(),
				});
				return res.json({ success: true, cached: true, url: publicUrl });
			}
			if (!isNotFoundError(existingError)) {
				logger.warn('[public/story-audio] Failed cache check; attempting generation', { page, objectPath, error: String(existingError.message || existingError) });
			}
		} catch (error) {
			logger.warn('[public/story-audio] Cache check threw; attempting generation', { page, objectPath, error: error instanceof Error ? error.message : String(error) });
		}

		storyAudioTelemetry.cacheMisses += 1;
		markStoryAudioEvent();

		if (!isStoryAudioRuntimeGenerationAllowed()) {
			storyAudioTelemetry.generationDisabled += 1;
			markStoryAudioEvent();
			logger.warn('[public/story-audio] Runtime generation disabled on cache miss', {
				page,
				ip: req.ip,
				objectPath,
				totals: getStoryAudioTelemetrySnapshot(),
			});
			return res.status(503).json({
				success: false,
				error: 'Story audio is not precomputed for this page/content. Runtime generation is disabled.',
			});
		}

		logger.info('[public/story-audio] Cache miss; generation required', {
			page,
			ip: req.ip,
			objectPath,
			totals: getStoryAudioTelemetrySnapshot(),
		});

		req.storyAudioEnsureContext = {
			page,
			text,
			voice,
			totalPages,
			objectPath,
			publicUrl,
		};

		return next();
	};

	router.post('/story-audio/ensure', prepareStoryAudioEnsure, storyAudioGenerationLimiter, async (req, res) => {
		const ensureContext = req.storyAudioEnsureContext;
		if (!ensureContext) {
			return res.status(500).json({
				success: false,
				error: 'Story-audio request context missing',
			});
		}

		const { page, text, voice, objectPath, publicUrl } = ensureContext;

		storyAudioTelemetry.generationAttempts += 1;
		markStoryAudioEvent();

		if (!openai?.audio?.speech?.create || typeof openai.audio.speech.create !== 'function') {
			storyAudioTelemetry.generationFailure += 1;
			markStoryAudioEvent();
			return res.status(503).json({ success: false, error: 'OpenAI TTS is not available on server' });
		}

		try {
			storyAudioTelemetry.openAiCalls += 1;
			markStoryAudioEvent();
			const ttsResponse = await openai.audio.speech.create({
				model: 'tts-1',
				voice,
				input: text,
				format: 'mp3',
			});

			const audioArrayBuffer = await ttsResponse.arrayBuffer();
			const audioBuffer = Buffer.from(audioArrayBuffer);

			const { error: uploadError } = await supabase.storage.from(STORY_AUDIO_BUCKET).upload(objectPath, audioBuffer, {
				contentType: 'audio/mpeg',
				upsert: false,
				cacheControl: '31536000',
			});

			if (uploadError) {
				const isAlreadyUploaded = String(uploadError.message || '').toLowerCase().includes('already exists') || Number(uploadError.statusCode || 0) === 409;
				if (!isAlreadyUploaded) {
					logger.error('[public/story-audio] Upload failed', { page, objectPath, error: uploadError.message });
					return res.status(502).json({ success: false, error: 'Failed to upload story audio' });
				}
			}

			storyAudioTelemetry.generationSuccess += 1;
			markStoryAudioEvent();
			logger.info('[public/story-audio] Generation success', {
				page,
				ip: req.ip,
				objectPath,
				totals: getStoryAudioTelemetrySnapshot(),
			});

			return res.json({
				success: true,
				cached: false,
				url: publicUrl,
				audioBase64: audioBuffer.toString('base64'),
			});
		} catch (error) {
			storyAudioTelemetry.generationFailure += 1;
			markStoryAudioEvent();
			logger.error('[public/story-audio] TTS generation failed', {
				page,
				objectPath,
				error: error instanceof Error ? error.message : String(error),
				totals: getStoryAudioTelemetrySnapshot(),
			});
			return res.status(502).json({ success: false, error: 'Failed to generate story audio' });
		}
	});

	router.get('/story-audio/status', async (_req, res) => {
		const warnings = [];
		const hasSupabaseUrl = Boolean(normalizeSupabasePublicBaseUrl());
		const hasOpenAiTts = Boolean(openai?.audio?.speech?.create && typeof openai.audio.speech.create === 'function');

		let bucketExists = null;
		let bucketIsPublic = null;
		let publicReadProbe = 'unknown';

		if (!hasSupabaseUrl) warnings.push('Missing SUPABASE_URL (or VITE_SUPABASE_URL) on server.');
		if (!hasOpenAiTts) warnings.push('OpenAI TTS is not available. Check OPENAI_API_KEY and AI_ENABLED.');

		if (supabase?.storage && typeof supabase.storage.listBuckets === 'function') {
			try {
				const { data, error } = await supabase.storage.listBuckets();
				if (!error && Array.isArray(data)) {
					const bucket = data.find((entry) => entry?.name === STORY_AUDIO_BUCKET);
					bucketExists = Boolean(bucket);
					bucketIsPublic = typeof bucket?.public === 'boolean' ? Boolean(bucket.public) : null;
					if (!bucket) warnings.push(`Bucket ${STORY_AUDIO_BUCKET} does not exist.`);
					if (bucket && bucketIsPublic === false) warnings.push(`Bucket ${STORY_AUDIO_BUCKET} exists but is not public.`);
				} else {
					warnings.push(`Unable to verify bucket ${STORY_AUDIO_BUCKET} via listBuckets.`);
				}
			} catch {
				warnings.push(`Unable to verify bucket ${STORY_AUDIO_BUCKET}.`);
			}
		} else {
			warnings.push('Supabase client cannot list buckets in current configuration.');
		}

		if (hasSupabaseUrl) {
			try {
				const probeUrl = buildStoryAudioPublicUrl(`${STORY_AUDIO_PATH_PREFIX}/${STORY_AUDIO_CACHE_VERSION}/probe.mp3`);
				const probeResponse = await fetch(probeUrl, { method: 'HEAD' });
				if (probeResponse.status === 401 || probeResponse.status === 403) {
					publicReadProbe = 'forbidden';
					warnings.push('Public story-audio URL is not readable (401/403). Make the bucket public.');
				} else if (probeResponse.ok || probeResponse.status === 404) {
					publicReadProbe = 'ok';
				}
			} catch {
				publicReadProbe = 'unreachable';
				warnings.push('Unable to probe Supabase public URL for story-audio.');
			}
		}

		return res.json({
			success: true,
			configured: {
				supabaseUrl: hasSupabaseUrl,
				openAiTts: hasOpenAiTts,
			},
			bucket: {
				exists: bucketExists,
				isPublic: bucketIsPublic,
				publicReadProbe,
			},
			warnings,
		});
	});

	router.get('/story-audio/metrics', (_req, res) => {
		return res.json({
			success: true,
			metrics: getStoryAudioTelemetrySnapshot(),
		});
	});

	return router;
}

module.exports = createPublicRouter;
