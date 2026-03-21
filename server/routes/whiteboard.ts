import type { Request, Response } from 'express';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Knex } from 'knex';
import { createHash, randomBytes } from 'crypto';
import { gzip } from 'zlib';
import { promisify } from 'util';
import { z } from 'zod';
import * as Y from 'yjs';
import { validateRequest } from '../validation/validateRequest';
import { createWhiteboardWsToken } from '../realtime/whiteboardWsTokens';
import { buildLegacyTutorPayload, parseStructuredTutorAnalysis } from '../tutor/analysisParser';
import { buildMathFacts, type DeterministicMathFacts, type TutorAnalysisPipeline, type TutorAnalysisSource } from '../math';
import { buildWhiteboardTutorCacheKey } from './whiteboardTutorCacheKey';
const supabase = require('../lib/supabaseClient');

const gzipAsync = promisify(gzip);
const BOARD_ID_MAX_LENGTH = 64;
const MAX_HISTORY_EVENTS = 5000;
const JOIN_INVITE_EXPIRY_DAYS = 7;
const JOIN_INVITE_DEFAULT_MAX_USES = 1;
const JOIN_INVITE_TOKEN_BYTES = 32;
const WHITEBOARD_TUTOR_CACHE_VERSION = 'v1';

const BoardIdParamsSchema = z.object({
  boardId: z.string().uuid().max(BOARD_ID_MAX_LENGTH),
});

const JoinInviteBodySchema = z.object({
  token: z.string().min(1).max(2048),
});

const HelpRequestIdParamsSchema = z.object({
  requestId: z.string().uuid(),
});

const WhiteboardHelpRequestBodySchema = z.object({
  requestText: z.string().trim().max(2000).optional(),
  problemDraft: z.string().trim().max(12000).optional(),
});

const WhiteboardTutorMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});

const WhiteboardTutorBodySchema = z.object({
  imageDataUrl: z.string().min(1).max(12_000_000).optional(),
  imageMimeType: z.string().max(128).optional(),
  imageName: z.string().max(255).optional(),
  inputMode: z.enum(['photo', 'text']).optional(),
  textContent: z.string().trim().max(12_000).optional(),
  audienceAge: z.number().int().min(5).max(20).optional(),
  messages: z.array(WhiteboardTutorMessageSchema).max(40).optional(),
  mode: z.enum(['analysis', 'tutor', 'chat']).optional(),
  skipCache: z.boolean().optional(),
  modelTier: z.enum(['standard', 'stronger']).optional(),
}).superRefine((value, ctx) => {
  if (value.inputMode === 'text') {
    if (!value.textContent?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['textContent'],
        message: 'Text content is required in text mode',
      });
    }
    return;
  }

  if (!value.imageDataUrl?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['imageDataUrl'],
      message: 'Image data is required in photo mode',
    });
  }
});

const WHITEBOARD_TRANSCRIPTION_MODEL = 'gemini-2.0-flash';
const WHITEBOARD_TRANSCRIPTION_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
const WHITEBOARD_EVALUATION_MODEL = 'claude-sonnet-4-20250514';
const SHOULD_LOG_TUTOR_FIX_DEBUG = process.env.TUTOR_DEBUG === 'true';
const MEMBERSHIP_FALLBACK_LOG_WINDOW_MS = 15_000;

const membershipFallbackLogTimestamps = new Map<string, number>();

type TutorModelTier = 'standard' | 'stronger';

type TutorModelMetadata = {
  tier: TutorModelTier;
  strongerModelAvailable: boolean;
  transcriptionModel: string | null;
  evaluationModel: string | null;
};

type WhiteboardTutorRouteResponse = ReturnType<typeof buildLegacyTutorPayload> & {
  modelMetadata: TutorModelMetadata;
};

type WhiteboardTutorTranscriptionResponse = {
  transcription: WhiteboardTutorTranscription;
  modelUsed: string | null;
};

type WhiteboardTutorEvaluationResponse = {
  response: ReturnType<typeof buildLegacyTutorPayload>;
  modelUsed: string;
};

type TutorModelConfig = {
  requestedTier: TutorModelTier;
  strongerModelAvailable: boolean;
  transcriptionModel: string;
  evaluationModel: string;
};

function tutorFixDebug(label: string, details: Record<string, unknown>): void {
  if (!SHOULD_LOG_TUTOR_FIX_DEBUG) return;
  console.info('[TUTOR-FIX-DEBUG]', label, details);
}

function logMathEngine(stage: string, details: Record<string, unknown>): void {
  console.log(`[MATH-ENGINE] ${stage}`, details);
}

function logMembershipFallback(
  level: 'log' | 'warn',
  message: string,
  details: Record<string, unknown>,
): void {
  const dedupeKey = [
    message,
    String(details.boardId ?? ''),
    String(details.userId ?? ''),
    String(details.reason ?? details.code ?? ''),
  ].join(':');
  const now = Date.now();
  const lastLoggedAt = membershipFallbackLogTimestamps.get(dedupeKey) ?? 0;

  if (now - lastLoggedAt < MEMBERSHIP_FALLBACK_LOG_WINDOW_MS) {
    return;
  }

  membershipFallbackLogTimestamps.set(dedupeKey, now);
  console[level](message, details);
}

function isMathEngineFallbackUsed(mathFacts: DeterministicMathFacts): boolean {
  return !mathFacts.supported || mathFacts.confidence === 'low' || mathFacts.domain === 'unknown';
}

function buildMathEnginePayloadSummary(response: ReturnType<typeof buildLegacyTutorPayload>): Record<string, unknown> {
  return {
    analysisSource: response.analysisSource ?? null,
    stepCount: response.analysisResult?.steps?.length ?? 0,
    finalAnswerCount: response.analysisResult?.finalAnswers?.length ?? 0,
    hasProblemText: Boolean(response.analysisResult?.problemText?.trim()),
    hasOverallSummary: Boolean(response.analysisResult?.overallSummary?.trim()),
  };
}

function buildTutorAnalysisPipeline(mathFacts: DeterministicMathFacts): TutorAnalysisPipeline {
  const analysisSource: TutorAnalysisSource = mathFacts.supported ? 'deterministic' : 'fallback-llm';

  return {
    analysisSource,
    deterministic: mathFacts,
    fallback: {
      ran: !mathFacts.supported,
      source: !mathFacts.supported ? 'anthropic' : null,
      type: !mathFacts.supported ? 'llm-evaluation' : null,
      reason: !mathFacts.supported ? mathFacts.unsupportedReason ?? 'Deterministic checker unsupported.' : undefined,
    },
  };
}

function resolveTutorModelTier(value: unknown): TutorModelTier {
  return value === 'stronger' ? 'stronger' : 'standard';
}

function getConfiguredTutorModelConfig(body: WhiteboardTutorBody): TutorModelConfig {
  const requestedTier = resolveTutorModelTier(body.modelTier);
  const standardTranscriptionModel = normalizeModelNameForSdk(process.env.WHITEBOARD_TRANSCRIPTION_MODEL?.trim() || WHITEBOARD_TRANSCRIPTION_MODEL);
  const strongerTranscriptionModel = normalizeModelNameForSdk(process.env.WHITEBOARD_TRANSCRIPTION_STRONGER_MODEL?.trim() || '');
  const standardEvaluationModel = normalizeModelNameForSdk(process.env.WHITEBOARD_EVALUATION_MODEL?.trim() || WHITEBOARD_EVALUATION_MODEL);
  const strongerEvaluationModel = normalizeModelNameForSdk(process.env.WHITEBOARD_EVALUATION_STRONGER_MODEL?.trim() || '');
  const strongerModelAvailable = Boolean(
    (body.inputMode !== 'text' && strongerTranscriptionModel && strongerTranscriptionModel !== standardTranscriptionModel)
    || (strongerEvaluationModel && strongerEvaluationModel !== standardEvaluationModel)
  );

  return {
    requestedTier,
    strongerModelAvailable,
    transcriptionModel: requestedTier === 'stronger'
      && body.inputMode !== 'text'
      && strongerTranscriptionModel
      && strongerTranscriptionModel !== standardTranscriptionModel
      ? strongerTranscriptionModel
      : standardTranscriptionModel,
    evaluationModel: requestedTier === 'stronger'
      && strongerEvaluationModel
      && strongerEvaluationModel !== standardEvaluationModel
      ? strongerEvaluationModel
      : standardEvaluationModel,
  };
}

function buildTutorModelMetadata(
  body: WhiteboardTutorBody,
  config: TutorModelConfig,
  modelsUsed: { transcriptionModel: string | null; evaluationModel: string },
): TutorModelMetadata {
  return {
    tier: config.requestedTier,
    strongerModelAvailable: config.strongerModelAvailable,
    transcriptionModel: body.inputMode === 'text' ? null : modelsUsed.transcriptionModel,
    evaluationModel: modelsUsed.evaluationModel,
  };
}

const WHITEBOARD_TRANSCRIPTION_PROMPT = `Look at this homework photo and return only JSON.

Tasks:
1. Identify the full problem text.
2. Split the student's visible work into steps in reading order.
3. For each visible step, give a short transcription.
4. If possible, estimate a normalized bounding box for each visible step.

Rules:
- Do not judge correctness yet.
- Use normalized coordinates from 0 to 1.
- If a region is unclear, skip the region instead of guessing wildly.
- Keep text short.

Return JSON exactly like this:
{
  "problem": "string",
  "regions": [{ "id": "region-1", "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.12 }],
  "steps": [{ "stepNumber": 1, "content": "string", "regionId": "region-1" }]
}`;
const WHITEBOARD_EVALUATION_SYSTEM_PROMPT = `You are a calm, supportive math tutor for children.

When deterministic math facts are provided, treat them as the source of truth for correctness.
Do not replace verified answers or verified mistakes with a different math conclusion.
If the deterministic math facts say support is low or unsupported, stay cautious and do not invent exact certainty.

Use simple language a 10-year-old can understand.
Keep every explanation short.
Avoid long paragraphs and advanced vocabulary.
Do not shame the learner.
Do not reveal the full solution too early in the step explanations.

Return ONLY JSON.
No markdown. No preamble. No commentary outside JSON.

Required JSON shape:
{
  "problemText": "string",
  "finalAnswers": ["string"],
  "overallSummary": "string",
  "regions": [{ "id": "region-1", "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.12 }],
  "steps": [{
    "id": "step-1",
    "index": 0,
    "studentText": "string",
    "normalizedMath": "string",
    "status": "correct | incorrect | partial | warning",
    "shortLabel": "string",
    "kidFriendlyExplanation": "string",
    "correction": "string",
    "hint": "string",
    "regionId": "region-1"
  }],
  "validatorWarnings": ["string"],
  "canAnimate": true
}

Rules for the JSON:
- problemText: the full problem the learner is trying to solve
- finalAnswers: final answer or answers only
- steps: split the visible work into small readable steps
- kidFriendlyExplanation: short, warm, and simple
- status: choose the best fit for each step
- use deterministic math facts as the ground truth whenever they are present and supported
- if a step is incorrect, do not praise it
- focus the earliest blocking mistake before later downstream consequences
- regions: optional; include only if reasonably visible
- if region matching is weak, keep the step and omit regionId
- validatorWarnings: leave empty unless the model sees an obvious caution
- canAnimate: true when there is more than one meaningful step`;

const WhiteboardTutorTranscriptionSchema = z.object({
  problem: z.string().trim().default(''),
  regions: z.array(z.object({
    id: z.string().trim().min(1),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })).default([]),
  steps: z.array(z.object({
    stepNumber: z.number().int().min(1),
    content: z.string().trim().default(''),
    regionId: z.string().trim().optional(),
  })).default([]),
});

type AuthenticatedRequest = Request & {
  user?: {
    id?: string;
    role?: string;
    isTutor?: boolean;
    app_metadata?: {
      role?: string;
      is_tutor?: boolean;
    };
  };
  validated?: {
    params?: {
      boardId: string;
      requestId?: string;
    };
    body?: {
      token: string;
    };
  };
};

type WhiteboardHelpRequestRow = {
  id: string;
  board_id: string;
  student_user_id: string;
  claimed_by_user_id: string | null;
  status: 'pending' | 'claimed' | 'resolved' | 'cancelled';
  request_text: string | null;
  problem_draft: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  claimed_at: string | Date | null;
  resolved_at: string | Date | null;
  board_name?: string | null;
  student_username?: string | null;
  claimed_by_username?: string | null;
};

type WhiteboardEventRow = {
  id: number | string;
  event_type: 'stroke:start' | 'stroke:move' | 'stroke:end';
  stroke_id: string;
  x: number | string;
  y: number | string;
  t: number | string;
  segment_index: number | null;
  source_id: string | null;
  color: string | null;
  width: number | null;
};

type HistoryCursor = {
  lastSeq: number;
  lastTs: string | null;
};

type WhiteboardInviteRow = {
  id: string;
  room_id: string;
  token_hash: string;
  created_by: string;
  expires_at: string | Date;
  max_uses: number | string;
  uses: number | string;
  revoked_at: string | Date | null;
};

type WhiteboardTutorMessage = z.infer<typeof WhiteboardTutorMessageSchema>;

type WhiteboardTutorBody = z.infer<typeof WhiteboardTutorBodySchema>;
type WhiteboardTutorTranscription = z.infer<typeof WhiteboardTutorTranscriptionSchema>;

type GeminiErrorInfo = {
  statusCode?: number;
  reason?: string;
  message: string;
};

type TutorPipelineError = Error & {
  statusCode?: number;
  stage?: 'transcription' | 'evaluation';
  provider?: 'gemini' | 'anthropic';
  model?: string;
};

function shouldReadWhiteboardTutorCache(body: WhiteboardTutorBody): boolean {
  if (body.skipCache) return false;
  return (body.mode ?? 'analysis') === 'analysis';
}

function shouldWriteWhiteboardTutorCache(body: WhiteboardTutorBody): boolean {
  return (body.mode ?? 'analysis') === 'analysis';
}

function withTutorCacheSource<T extends WhiteboardTutorRouteResponse>(
  response: T,
  cacheSource: 'fresh' | 'server-cache',
): T & { cacheSource: 'fresh' | 'server-cache' } {
  return {
    ...response,
    cacheSource,
  };
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const dbError = error as {
    code?: string;
    message?: string;
  };

  if (dbError.code === '42P01') return true;

  const message = String(dbError.message || '');
  return message.includes('no such table') || message.includes('Unexpected table: whiteboard_tutor_cache');
}

async function readWhiteboardTutorCache(
  db: Knex,
  boardId: string,
  body: WhiteboardTutorBody,
): Promise<WhiteboardTutorRouteResponse | null> {
  if (!shouldReadWhiteboardTutorCache(body)) return null;

  try {
    const cacheKey = buildWhiteboardTutorCacheKey(boardId, body, WHITEBOARD_TUTOR_CACHE_VERSION);
    const row = await db('whiteboard_tutor_cache')
      .select('response_json')
      .where({ board_id: boardId, cache_key: cacheKey })
      .first() as { response_json?: unknown } | null;

    const response = row?.response_json;
    if (!response || typeof response !== 'object') return null;

    const cachedResponse = response as Partial<WhiteboardTutorRouteResponse>;
    if (!cachedResponse.modelMetadata || typeof cachedResponse.modelMetadata !== 'object') {
      return null;
    }

    return cachedResponse as WhiteboardTutorRouteResponse;
  } catch (error) {
    if (isMissingRelationError(error)) {
      return null;
    }
    throw error;
  }
}

async function writeWhiteboardTutorCache(
  db: Knex,
  boardId: string,
  body: WhiteboardTutorBody,
  response: WhiteboardTutorRouteResponse,
): Promise<void> {
  if (!shouldWriteWhiteboardTutorCache(body)) return;

  const cacheKey = buildWhiteboardTutorCacheKey(boardId, body, WHITEBOARD_TUTOR_CACHE_VERSION);
  const payload = {
    board_id: boardId,
    cache_key: cacheKey,
    input_mode: body.inputMode === 'text' ? 'text' : 'photo',
    response_json: response,
    updated_at: db.fn.now(),
  };

  try {
    await db('whiteboard_tutor_cache')
      .insert(payload)
      .onConflict(['board_id', 'cache_key'])
      .merge(payload);
  } catch (error) {
    if (isMissingRelationError(error)) {
      return;
    }
    if (isTutorCacheRoomForeignKeyError(error)) {
      const hydrated = await hydrateMissingRoomForTutorCache(db, boardId);
      if (!hydrated) {
        return;
      }

      await db('whiteboard_tutor_cache')
        .insert(payload)
        .onConflict(['board_id', 'cache_key'])
        .merge(payload);
      return;
    }
    throw error;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function normalizeModelNameForSdk(model: string): string {
  return model.trim().replace(/^models\//i, '');
}

function buildGeminiModelCandidates(configuredModel: string): string[] {
  const normalizedConfigured = normalizeModelNameForSdk(configuredModel || WHITEBOARD_TRANSCRIPTION_MODEL);
  const models = [normalizedConfigured, ...WHITEBOARD_TRANSCRIPTION_FALLBACK_MODELS];
  return models.filter((model, index) => model.length > 0 && models.indexOf(model) === index);
}

function extractGeminiErrorInfo(error: unknown): GeminiErrorInfo {
  const errorRecord = asRecord(error);
  const nestedError = asRecord(errorRecord?.error);
  const response = asRecord(errorRecord?.response);
  const responseData = asRecord(response?.data);
  const responseError = asRecord(responseData?.error);
  const providerError = responseError || nestedError;

  const statusCodeValue = providerError?.code ?? errorRecord?.status ?? errorRecord?.statusCode;
  const statusCode = typeof statusCodeValue === 'number' ? statusCodeValue : undefined;

  const reasonValue = providerError?.status ?? providerError?.reason ?? errorRecord?.code;
  const reason = typeof reasonValue === 'string' ? reasonValue : undefined;

  const messageValue = providerError?.message ?? errorRecord?.message;
  const message = typeof messageValue === 'string' && messageValue.trim().length > 0
    ? messageValue
    : 'Gemini request failed';

  return { statusCode, reason, message };
}

function isModelNotFoundError(errorInfo: GeminiErrorInfo): boolean {
  const combined = `${errorInfo.reason || ''} ${errorInfo.message}`.toLowerCase();
  return errorInfo.statusCode === 404 || combined.includes('not found') || combined.includes('not supported');
}

function toTutorPipelineError(
  message: string,
  options: {
    statusCode?: number;
    stage: 'transcription' | 'evaluation';
    provider: 'gemini' | 'anthropic';
    model?: string;
  },
): TutorPipelineError {
  const error = new Error(message) as TutorPipelineError;
  error.statusCode = options.statusCode;
  error.stage = options.stage;
  error.provider = options.provider;
  error.model = options.model;
  return error;
}

function summarizeAnthropicError(error: unknown): { message: string; statusCode: number } {
  const fallback = { message: 'Anthropic evaluation failed', statusCode: 502 };
  if (!error || typeof error !== 'object') return fallback;

  const candidate = error as {
    status?: unknown;
    message?: unknown;
    error?: { type?: unknown; message?: unknown };
  };

  const statusCode = typeof candidate.status === 'number' ? candidate.status : 502;
  const nestedType = typeof candidate.error?.type === 'string' ? candidate.error.type : null;
  const nestedMessage = typeof candidate.error?.message === 'string' ? candidate.error.message : null;
  const rootMessage = typeof candidate.message === 'string' ? candidate.message : null;
  const rawMessage = nestedMessage || rootMessage || fallback.message;
  const lower = rawMessage.toLowerCase();

  if (statusCode === 401 || lower.includes('invalid x-api-key') || lower.includes('authentication_error')) {
    return {
      statusCode: 502,
      message: 'Anthropic authentication failed: invalid ANTHROPIC_API_KEY',
    };
  }

  return {
    statusCode: statusCode >= 400 && statusCode < 600 ? statusCode : 502,
    message: nestedType ? `${nestedType}: ${rawMessage}` : rawMessage,
  };
}

function parseImageDataUrl(dataUrl: string, fallbackMimeType?: string): { mimeType: string; base64Data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image payload');
  }

  const mimeType = (fallbackMimeType || match[1] || 'image/png').trim().toLowerCase();
  const base64Data = match[2]?.trim();
  if (!base64Data) {
    throw new Error('Missing image data');
  }

  return { mimeType, base64Data };
}

function formatConversationTranscript(messages: WhiteboardTutorMessage[]): string {
  return messages
    .map((message) => `${message.role === 'assistant' ? 'Tutor' : 'You'}: ${message.content}`)
    .join('\n\n');
}

function extractJsonText(rawText: string): string {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function sanitizeJsonText(rawText: string): string {
  return rawText
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function isInvalidJsonTutorError(error: unknown): boolean {
  return error instanceof Error && /invalid json/i.test(error.message);
}

function parseJsonResponse<T>(rawText: string, schema: z.ZodType<T>, label: string): T {
  const candidates = [
    extractJsonText(rawText),
    sanitizeJsonText(extractJsonText(rawText)),
    sanitizeJsonText(rawText.trim()),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return schema.parse(parsed);
    } catch (error) {
      if (error instanceof z.ZodError) {
        break;
      }
    }
  }

  const wrappedError = new Error(`${label} returned invalid JSON`) as Error & { statusCode?: number };
  wrappedError.statusCode = 502;
  throw wrappedError;
}

function buildDeterministicMathFactsPrompt(mathFacts: DeterministicMathFacts): string {
  return JSON.stringify({
    supported: mathFacts.supported,
    domain: mathFacts.domain,
    canonicalProblem: mathFacts.canonicalProblem,
    verifiedAnswer: mathFacts.verifiedAnswer,
    verifiedSteps: mathFacts.verifiedSteps,
    detectedError: mathFacts.detectedError,
    confidence: mathFacts.confidence,
    unsupportedReason: mathFacts.unsupportedReason,
  })
}

function buildPassTwoUserPrompt(
  body: WhiteboardTutorBody,
  transcription: WhiteboardTutorTranscription,
  mathFacts: DeterministicMathFacts,
): string {
  if (body.inputMode === 'text' && body.textContent?.trim()) {
    const basePrompt = `The student has typed their problem as text. 
There is no photo. The problem is:

${body.textContent.trim()}

Deterministic math facts for this request:
${buildDeterministicMathFactsPrompt(mathFacts)}

Use those deterministic math facts as the source of truth when supported.
If support is low or unsupported, stay cautious and do not invent exact answers.
Then describe the likely steps in a short, kid-friendly way.
If no student work is shown, keep the steps gentle and guidance-focused.

The student's age is: ${typeof body.audienceAge === 'number' ? body.audienceAge : 'not provided'}`;

    const transcript = formatConversationTranscript(body.messages ?? []);
    if (!transcript) {
      return basePrompt;
    }

    return `${basePrompt}\n\nConversation so far:\n${transcript}`;
  }

  const basePrompt = `The problem is: ${transcription.problem}
Visible step transcriptions: ${JSON.stringify(transcription.steps)}
Visible step regions: ${JSON.stringify(transcription.regions)}
Deterministic math facts: ${buildDeterministicMathFactsPrompt(mathFacts)}
The student's age is: ${typeof body.audienceAge === 'number' ? body.audienceAge : 'not provided'}
Use the deterministic math facts as the source of truth when they are supported.
If they are unsupported, keep the feedback cautious.
Then evaluate each visible step against the verified facts.
Keep the response compact and kid-friendly.`;

  const transcript = formatConversationTranscript(body.messages ?? []);
  if (!transcript) {
    return basePrompt;
  }

  return `${basePrompt}\n\nConversation so far:\n${transcript}`;
}

async function callWhiteboardTranscription(
  body: WhiteboardTutorBody,
  configuredModel: string,
): Promise<WhiteboardTutorTranscriptionResponse> {
  if (body.inputMode === 'text' && body.textContent?.trim()) {
    return {
      transcription: {
        problem: body.textContent.trim(),
        steps: [],
        regions: [],
      },
      modelUsed: null,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw toTutorPipelineError('GEMINI_API_KEY is not configured', {
      statusCode: 503,
      stage: 'transcription',
      provider: 'gemini',
      model: configuredModel,
    });
  }

  const { mimeType, base64Data } = parseImageDataUrl(body.imageDataUrl, body.imageMimeType);
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelCandidates = buildGeminiModelCandidates(configuredModel);

  let lastError: GeminiErrorInfo | null = null;

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const candidateModel = modelCandidates[index];
    const isLastCandidate = index === modelCandidates.length - 1;

    try {
      const modelClient = genAI.getGenerativeModel({ model: candidateModel });
      const result = await modelClient.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              {
                text: WHITEBOARD_TRANSCRIPTION_PROMPT,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1200,
          responseMimeType: 'application/json',
        },
      });

      const reply = result?.response?.text()?.trim();
      if (!reply) {
        throw new Error('Gemini returned an empty response');
      }

      return {
        transcription: parseJsonResponse(reply, WhiteboardTutorTranscriptionSchema, 'Pass 1 transcription'),
        modelUsed: candidateModel,
      };
    } catch (error) {
      const errorInfo = extractGeminiErrorInfo(error);
      lastError = errorInfo;

      if (!isLastCandidate && isInvalidJsonTutorError(error)) {
        continue;
      }

      if (!isLastCandidate && isModelNotFoundError(errorInfo)) {
        continue;
      }

      throw toTutorPipelineError(errorInfo.message, {
        statusCode: errorInfo.statusCode === 404 ? 502 : errorInfo.statusCode || 502,
        stage: 'transcription',
        provider: 'gemini',
        model: candidateModel,
      });
    }
  }

  throw toTutorPipelineError(lastError?.message || 'Gemini request failed', {
    statusCode: lastError?.statusCode === 404 ? 502 : lastError?.statusCode || 502,
    stage: 'transcription',
    provider: 'gemini',
    model: modelCandidates[modelCandidates.length - 1],
  });
}

async function callWhiteboardEvaluation(
  boardId: string,
  body: WhiteboardTutorBody,
  transcription: WhiteboardTutorTranscription,
  mathFacts: DeterministicMathFacts,
  evaluationModel: string,
): Promise<WhiteboardTutorEvaluationResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw toTutorPipelineError('ANTHROPIC_API_KEY is not configured', {
      statusCode: 503,
      stage: 'evaluation',
      provider: 'anthropic',
      model: evaluationModel,
    });
  }

  const anthropic = new Anthropic({ apiKey });
  try {
    const result = await anthropic.messages.create({
      model: evaluationModel,
      system: WHITEBOARD_EVALUATION_SYSTEM_PROMPT,
      metadata: {
        user_id: `whiteboard-${body.inputMode === 'text' ? 'text' : 'photo'}-mode`,
      },
      temperature: 0.2,
      max_tokens: 1800,
      messages: [
        {
          role: 'user',
          content: buildPassTwoUserPrompt(body, transcription, mathFacts),
        },
      ],
    });

    const text = result.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!text) {
      throw toTutorPipelineError('Claude returned an empty response', {
        statusCode: 502,
        stage: 'evaluation',
        provider: 'anthropic',
        model: evaluationModel,
      });
    }

    tutorFixDebug('raw-ai-tutor-payload', {
      inputMode: body.inputMode,
      preview: text.slice(0, 500),
      length: text.length,
    });

    const parsedAnalysis = parseStructuredTutorAnalysis(text, { mathFacts });

    tutorFixDebug('normalized-ai-tutor-payload', {
      problemText: parsedAnalysis.problemText,
      finalAnswers: parsedAnalysis.finalAnswers,
      overallSummary: parsedAnalysis.overallSummary,
      stepStatuses: parsedAnalysis.steps.map((step) => ({
        index: step.index,
        shortLabel: step.shortLabel,
        status: step.status,
      })),
      validatorWarnings: parsedAnalysis.validatorWarnings,
    });

    const analysisPipeline = buildTutorAnalysisPipeline(mathFacts);
    const response = buildLegacyTutorPayload(parsedAnalysis, {
      mathFacts,
      analysisSource: analysisPipeline.analysisSource,
      analysisPipeline,
    });
    const fallbackUsed = isMathEngineFallbackUsed(mathFacts);

    logMathEngine('analysis result', {
      boardId,
      parsedProblemSummary: parsedAnalysis.problemText || transcription.problem || null,
      detectedError: mathFacts.detectedError ?? null,
      correctAnswer: parsedAnalysis.finalAnswers?.[0] ?? response.correctSolution ?? null,
      fallbackUsed,
      compactPayloadSummary: buildMathEnginePayloadSummary(response),
    });

    if (fallbackUsed) {
      logMathEngine('fallback used', {
        boardId,
        reason: mathFacts.unsupportedReason ?? mathFacts.confidence,
        supported: mathFacts.supported,
        domain: mathFacts.domain,
      });
    }

    return {
      response,
      modelUsed: evaluationModel,
    };
  } catch (error) {
    const summary = summarizeAnthropicError(error);
    throw toTutorPipelineError(summary.message, {
      statusCode: summary.statusCode,
      stage: 'evaluation',
      provider: 'anthropic',
      model: evaluationModel,
    });
  }
}

async function callWhiteboardTutor(boardId: string, body: WhiteboardTutorBody): Promise<WhiteboardTutorRouteResponse> {
  const modelConfig = getConfiguredTutorModelConfig(body);
  const { transcription, modelUsed: transcriptionModel } = await callWhiteboardTranscription(body, modelConfig.transcriptionModel);
  logMathEngine('parsed input', {
    boardId,
    extractedText: transcription.problem || body.textContent?.trim() || null,
    parsedProblemSummary: transcription.problem || null,
    inputMode: body.inputMode ?? 'photo',
    transcriptionModel,
    visibleStepCount: transcription.steps.length,
    regionCount: transcription.regions.length,
  });
  const mathFacts = buildMathFacts(transcription.problem, transcription.steps);
  const { response, modelUsed: evaluationModel } = await callWhiteboardEvaluation(
    boardId,
    body,
    transcription,
    mathFacts,
    modelConfig.evaluationModel,
  );

  return {
    ...response,
    modelMetadata: buildTutorModelMetadata(body, modelConfig, {
      transcriptionModel,
      evaluationModel,
    }),
  };
}

async function deleteWhiteboardFromSupabase(boardId: string): Promise<boolean> {
  const memberResult = await supabase
    .from('room_members')
    .delete()
    .eq('room_id', boardId);

  if (memberResult.error) {
    throw new Error(memberResult.error.message || 'Unable to delete whiteboard memberships');
  }

  const roomResult = await supabase
    .from('rooms')
    .delete()
    .eq('id', boardId)
    .select('id');

  if (roomResult.error) {
    throw new Error(roomResult.error.message || 'Unable to delete whiteboard room');
  }

  return Array.isArray(roomResult.data) && roomResult.data.length > 0;
}

function normalizeSeq(value: number | string): number | null {
  const seq = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(seq) ? Number(seq) : null;
}

function normalizeNumber(value: number | string): number | null {
  const num = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(num) ? Number(num) : null;
}

function hashInviteToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function makeInviteToken(): string {
  return randomBytes(JOIN_INVITE_TOKEN_BYTES).toString('base64url');
}

function toAffectedRows(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.length;
  return 0;
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const dbError = error as { code?: string; message?: string };
  if (dbError.code !== '42703') return false;
  const message = String(dbError.message || '').toLowerCase();
  return message.includes(`\"${columnName.toLowerCase()}\"`) || message.includes(` ${columnName.toLowerCase()} `);
}

function isInviteRoomForeignKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const dbError = error as {
    code?: string;
    constraint?: string;
    message?: string;
  };

  if (dbError.code === '23503' && dbError.constraint === 'whiteboard_invites_room_id_foreign') {
    return true;
  }

  return typeof dbError.message === 'string' && dbError.message.includes('whiteboard_invites_room_id_foreign');
}

function isTutorCacheRoomForeignKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const dbError = error as {
    code?: string;
    constraint?: string;
    message?: string;
  };

  if (dbError.code === '23503' && dbError.constraint === 'whiteboard_tutor_cache_board_id_foreign') {
    return true;
  }

  return typeof dbError.message === 'string' && dbError.message.includes('whiteboard_tutor_cache_board_id_foreign');
}

function isRoomMemberUserForeignKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const dbError = error as {
    code?: string;
    constraint?: string;
    message?: string;
  };

  if (dbError.code === '23503' && dbError.constraint === 'room_members_user_id_foreign') {
    return true;
  }

  return typeof dbError.message === 'string' && dbError.message.includes('room_members_user_id_foreign');
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const dbError = error as { code?: unknown };
  return dbError.code === '23505';
}

async function insertRoomMembershipLocally(
  db: Knex,
  roomId: string,
  userId: string,
  isOwner: boolean,
): Promise<void> {
  const existingMembership = await db('room_members')
    .where({ room_id: roomId, user_id: userId })
    .first();

  if (existingMembership) {
    return;
  }

  try {
    await db('room_members').insert({ room_id: roomId, user_id: userId, is_owner: isOwner });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return;
    }
    throw error;
  }
}

async function ensureLocalUserShadow(db: Knex, userId: string): Promise<void> {
  if (!userId) return;

  await db('users')
    .insert({
      id: userId,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .onConflict('id')
    .ignore();
}

async function hydrateMissingRoomForTutorCache(db: Knex, boardId: string): Promise<boolean> {
  try {
    const { data: roomData, error: roomErr } = await supabase
      .from('rooms')
      .select('id,created_by')
      .eq('id', boardId)
      .maybeSingle();

    if (roomErr) {
      console.warn('[WB-TUTOR] cache-room-hydrate:supabase-query-failed', {
        boardId,
        code: roomErr.code,
        message: roomErr.message,
      });
      return false;
    }

    const roomId = String((roomData as { id?: unknown } | null)?.id ?? '');
    if (!roomId) {
      console.warn('[WB-TUTOR] cache-room-hydrate:supabase-room-missing', { boardId });
      return false;
    }

    const createdBy = String((roomData as { created_by?: unknown } | null)?.created_by ?? '');
    const roomInsert: { id: string; created_by?: string } = { id: roomId };
    if (createdBy) roomInsert.created_by = createdBy;

    await db('rooms').insert(roomInsert).onConflict('id').ignore();

    tutorFixDebug('cache-room-hydrate-success', { boardId });
    return true;
  } catch (error) {
    console.warn('[WB-TUTOR] cache-room-hydrate:error', {
      boardId,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function ensureRoomMembershipWithFallback(
  db: Knex,
  roomId: string,
  userId: string,
  isOwner: boolean,
  logLabels: {
    localFkUserMissing: string;
    supabaseFallbackFailed: string;
    supabaseFallbackSuccess: string;
  },
): Promise<void> {
  try {
    await insertRoomMembershipLocally(db, roomId, userId, isOwner);
  } catch (membershipError) {
    if (!isRoomMemberUserForeignKeyError(membershipError)) {
      throw membershipError;
    }

    console.warn(logLabels.localFkUserMissing, {
      roomId,
      userId,
    });

    const { error: supabaseMembershipError } = await supabase
      .from('room_members')
      .insert({ room_id: roomId, user_id: userId, is_owner: isOwner });

    if (supabaseMembershipError && supabaseMembershipError.code !== '23505') {
      console.warn(logLabels.supabaseFallbackFailed, {
        roomId,
        userId,
        code: supabaseMembershipError.code,
        message: supabaseMembershipError.message,
      });
      throw membershipError;
    }

    console.info(logLabels.supabaseFallbackSuccess, {
      roomId,
      userId,
    });
  }
}

async function hydrateMissingRoomForInvite(db: Knex, boardId: string, userId: string): Promise<boolean> {
  try {
    const { data: roomData, error: roomErr } = await supabase
      .from('rooms')
      .select('id,created_by')
      .eq('id', boardId)
      .maybeSingle();

    if (roomErr) {
      console.warn('[WB-JOIN] invite-room-hydrate:supabase-query-failed', {
        boardId,
        userId,
        code: roomErr.code,
        message: roomErr.message,
      });
      return false;
    }

    const roomId = String((roomData as { id?: unknown } | null)?.id ?? '');
    if (!roomId) {
      console.warn('[WB-JOIN] invite-room-hydrate:supabase-room-missing', { boardId, userId });
      return false;
    }

    const createdBy = String((roomData as { created_by?: unknown } | null)?.created_by ?? '') || userId;

    await db('rooms')
      .insert({ id: roomId, created_by: createdBy })
      .onConflict('id')
      .ignore();

    try {
      await insertRoomMembershipLocally(db, roomId, createdBy, true);
    } catch (error) {
      if (!isRoomMemberUserForeignKeyError(error)) throw error;

      console.warn('[WB-JOIN] invite-room-hydrate:owner-membership-skipped', {
        boardId,
        userId: createdBy,
      });
    }

    console.info('[WB-JOIN] invite-room-hydrate:success', { boardId, userId });
    return true;
  } catch (error) {
    console.warn('[WB-JOIN] invite-room-hydrate:error', {
      boardId,
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function hydrateMissingRoomForJoin(db: Knex, boardId: string, inviteCreatedBy: string | null): Promise<boolean> {
  try {
    const { data: roomData, error: roomErr } = await supabase
      .from('rooms')
      .select('id,created_by')
      .eq('id', boardId)
      .maybeSingle();

    if (roomErr) {
      console.warn('[WB-JOIN] join-room-hydrate:supabase-query-failed', {
        boardId,
        code: roomErr.code,
        message: roomErr.message,
      });
      return false;
    }

    const roomId = String((roomData as { id?: unknown } | null)?.id ?? '');
    if (!roomId) {
      console.warn('[WB-JOIN] join-room-hydrate:supabase-room-missing', { boardId });
      return false;
    }

    const createdByFromRoom = String((roomData as { created_by?: unknown } | null)?.created_by ?? '');
    const createdBy = createdByFromRoom || (inviteCreatedBy ?? '');

    const roomInsert: { id: string; created_by?: string } = { id: roomId };
    if (createdBy) roomInsert.created_by = createdBy;

    await db('rooms').insert(roomInsert).onConflict('id').ignore();

    if (createdBy) {
      try {
        await insertRoomMembershipLocally(db, roomId, createdBy, true);
      } catch (error) {
        if (!isRoomMemberUserForeignKeyError(error)) throw error;

        console.warn('[WB-JOIN] join-room-hydrate:owner-membership-skipped', {
          boardId,
          userId: createdBy,
        });
      }
    }

    console.info('[WB-JOIN] join-room-hydrate:success', { boardId });
    return true;
  } catch (error) {
    console.warn('[WB-JOIN] join-room-hydrate:error', {
      boardId,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function getJoinInviteFailureReason(invite: WhiteboardInviteRow | null):
  | 'invalid_token'
  | 'revoked'
  | 'expired'
  | 'used_up'
  | null {
  if (!invite) return 'invalid_token';
  if (invite.revoked_at) return 'revoked';

  const expiresAt = new Date(invite.expires_at);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return 'expired';

  const uses = normalizeNumber(invite.uses);
  const maxUses = normalizeNumber(invite.max_uses);
  if (uses === null || maxUses === null || uses >= maxUses) return 'used_up';

  return null;
}

async function isBoardOwner(db: Knex, boardId: string, userId: string): Promise<boolean> {
  const ownerMembership = await db('room_members')
    .where({ room_id: boardId, user_id: userId, is_owner: true })
    .first();
  if (ownerMembership) return true;

  const room = await db('rooms').select('created_by').where({ id: boardId }).first();
  if (room && String((room as { created_by?: unknown }).created_by ?? '') === userId) return true;

  // If we reach here, Knex didn't confirm ownership. In non-test env, fall back to Supabase
  // to tolerate eventual consistency between databases.
  if (process.env.NODE_ENV === 'test') return false;

  try {
    const { data: memberData, error: memberErr } = await supabase
      .from('room_members')
      .select('is_owner')
      .eq('room_id', boardId)
      .eq('user_id', userId)
      .maybeSingle();

    if (memberErr) {
      console.warn('[WB-HTTP] owner-check:fallback:member-query-failed', { boardId, userId, code: memberErr.code, message: memberErr.message });
    } else if (memberData && (memberData as { is_owner?: unknown }).is_owner === true) {
      console.log('[WB-HTTP] owner-check:fallback', { boardId, userId, matched: true, reason: 'member_owner' });
      return true;
    }

    const { data: roomData, error: roomErr } = await supabase
      .from('rooms')
      .select('created_by')
      .eq('id', boardId)
      .maybeSingle();

    if (roomErr) {
      console.warn('[WB-HTTP] owner-check:fallback:room-query-failed', { boardId, userId, code: roomErr.code, message: roomErr.message });
    } else if (roomData && String((roomData as { created_by?: unknown }).created_by ?? '') === userId) {
      console.log('[WB-HTTP] owner-check:fallback', { boardId, userId, matched: true, reason: 'created_by' });
      return true;
    }

    console.log('[WB-HTTP] owner-check:fallback', { boardId, userId, matched: false, reason: 'none' });
    return false;
  } catch (e) {
    console.warn('[WB-HTTP] owner-check:fallback:error', { boardId, userId });
    return false;
  }
}

async function isMember(db: Knex, boardId: string, userId: string): Promise<boolean> {
  const row = await db('room_members').where({ room_id: boardId, user_id: userId }).first();
  if (row) return true;

  if (process.env.NODE_ENV === 'test') return false;

  try {
    const { data, error } = await supabase
      .from('room_members')
      .select('room_id')
      .eq('room_id', boardId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logMembershipFallback('warn', '[WB-HTTP] membership-fallback query failed', {
        boardId,
        userId,
        code: error.code,
        message: error.message,
      });
      return false;
    }

    const matched = Boolean(data?.room_id);
    if (matched) {
      logMembershipFallback('log', '[WB-HTTP] membership-fallback matched', { boardId, userId, reason: 'room_members' });
      return true;
    }

    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('created_by')
      .eq('id', boardId)
      .maybeSingle();

    if (roomError) {
      console.warn('[WB-HTTP] membership-owner-fallback query failed', {
        boardId,
        userId,
        code: roomError.code,
        message: roomError.message,
      });
      return false;
    }

    const ownerMatched = String((roomData as { created_by?: unknown } | null)?.created_by ?? '') === userId;
    if (ownerMatched) {
      logMembershipFallback('log', '[WB-HTTP] membership-owner-fallback matched', { boardId, userId, reason: 'created_by' });
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function isTutorOrAdmin(req: AuthenticatedRequest): boolean {
  return req.user?.role === 'admin' || req.user?.isTutor === true || req.user?.app_metadata?.is_tutor === true;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeHelpRequest(row: WhiteboardHelpRequestRow | null | undefined) {
  if (!row) return null;

  return {
    id: row.id,
    boardId: row.board_id,
    studentUserId: row.student_user_id,
    studentUsername: row.student_username ?? null,
    claimedByUserId: row.claimed_by_user_id ?? null,
    claimedByUsername: row.claimed_by_username ?? null,
    requestText: row.request_text ?? null,
    problemDraft: row.problem_draft ?? null,
    status: row.status,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
    claimedAt: toIsoString(row.claimed_at),
    resolvedAt: toIsoString(row.resolved_at),
    boardName: row.board_name ?? null,
  };
}

async function fetchHelpRequestById(db: Knex, requestId: string): Promise<ReturnType<typeof normalizeHelpRequest>> {
  const row = await db('whiteboard_help_requests as hr')
    .leftJoin('rooms as r', 'hr.board_id', 'r.id')
    .leftJoin('users as student_user', 'hr.student_user_id', 'student_user.id')
    .leftJoin('users as tutor_user', 'hr.claimed_by_user_id', 'tutor_user.id')
    .select(
      'hr.id',
      'hr.board_id',
      'hr.student_user_id',
      'hr.claimed_by_user_id',
      'hr.status',
      'hr.request_text',
      'hr.problem_draft',
      'hr.created_at',
      'hr.updated_at',
      'hr.claimed_at',
      'hr.resolved_at',
      'r.name as board_name',
      'student_user.username as student_username',
      'tutor_user.username as claimed_by_username',
    )
    .where('hr.id', requestId)
    .first();

  return normalizeHelpRequest((row as WhiteboardHelpRequestRow | undefined) ?? null);
}

async function fetchActiveHelpRequestForBoard(db: Knex, boardId: string): Promise<ReturnType<typeof normalizeHelpRequest>> {
  const row = await db('whiteboard_help_requests as hr')
    .leftJoin('rooms as r', 'hr.board_id', 'r.id')
    .leftJoin('users as student_user', 'hr.student_user_id', 'student_user.id')
    .leftJoin('users as tutor_user', 'hr.claimed_by_user_id', 'tutor_user.id')
    .select(
      'hr.id',
      'hr.board_id',
      'hr.student_user_id',
      'hr.claimed_by_user_id',
      'hr.status',
      'hr.request_text',
      'hr.problem_draft',
      'hr.created_at',
      'hr.updated_at',
      'hr.claimed_at',
      'hr.resolved_at',
      'r.name as board_name',
      'student_user.username as student_username',
      'tutor_user.username as claimed_by_username',
    )
    .where('hr.board_id', boardId)
    .whereIn('hr.status', ['pending', 'claimed'])
    .orderBy('hr.created_at', 'desc')
    .first();

  return normalizeHelpRequest((row as WhiteboardHelpRequestRow | undefined) ?? null);
}

async function fetchHistory(db: Knex, boardId: string): Promise<{ events: WhiteboardEventRow[]; cursor: HistoryCursor }> {
  let rows: WhiteboardEventRow[] = [];
  try {
    rows = await db<WhiteboardEventRow>('whiteboard_events')
      .select('id', 'event_type', 'stroke_id', 'x', 'y', 't', 'segment_index', 'source_id', 'color', 'width')
      .where('board_id', boardId)
      .orderBy('id', 'asc')
      .limit(MAX_HISTORY_EVENTS);
  } catch (error) {
    if (!isMissingColumnError(error, 'segment_index')) throw error;

    rows = (await db('whiteboard_events')
      .select('id', 'event_type', 'stroke_id', 'x', 'y', 't', db.raw('NULL::integer as segment_index'), 'source_id', 'color', 'width')
      .where('board_id', boardId)
      .orderBy('id', 'asc')
      .limit(MAX_HISTORY_EVENTS)) as WhiteboardEventRow[];
  }

  const lastRow = rows.length ? rows[rows.length - 1] : null;
  const lastSeq = lastRow ? normalizeSeq(lastRow.id) : null;

  return {
    events: rows,
    cursor: {
      lastSeq: lastSeq ?? 0,
      lastTs: null,
    },
  };
}

function shouldGzip(req: Request): boolean {
  const header = req.headers['accept-encoding'];
  if (!header || typeof header !== 'string') return false;
  return header.includes('gzip');
}

const WHITEBOARD_DOC_TABLE = 'whiteboard_documents';

type ExcalidrawSnapshotElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  fillStyle?: string;
  opacity?: number;
  points?: number[][];
  isDeleted?: boolean;
  customData?: Record<string, unknown>;
  // Text-related fields
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  fileId?: string;
  scale?: [number, number];
  status?: string;
};

type ExcalidrawSnapshotFile = {
  id: string;
  dataURL?: string;
  mimeType?: string;
  created?: number;
  lastRetrieved?: number;
};

function toUpdateBuffer(value: Buffer | Uint8Array | string | null): Uint8Array {
  if (!value) return new Uint8Array(0);
  if (value instanceof Uint8Array) return value;
  if (Buffer.isBuffer(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  // base64 string fallback
  const buf = Buffer.from(value, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

async function fetchExcalidrawScene(
  db: Knex,
  boardId: string,
): Promise<{ elements: ExcalidrawSnapshotElement[]; files: Record<string, ExcalidrawSnapshotFile> } | null> {
  try {
    const hasTable = await db.schema.hasTable(WHITEBOARD_DOC_TABLE);
    if (!hasTable) return null;

    const row = await db(WHITEBOARD_DOC_TABLE)
      .select('ydoc')
      .where({ board_id: boardId })
      .first();
    if (!row || !row.ydoc) return null;

    const update = toUpdateBuffer(row.ydoc);
    if (update.length === 0) return null;

    const doc = new Y.Doc();
    Y.applyUpdate(doc, update);
    const map = doc.getMap('excalidraw');
    const rawElements = map.get('elements');
    const rawFiles = map.get('files');

    if (!Array.isArray(rawElements)) {
      doc.destroy();
      return null;
    }

    // Filter to visible, non-deleted elements with valid coordinates
    const elements = rawElements
      .filter((el: any) => {
        if (!el || typeof el !== 'object') return false;
        if (el.isDeleted) return false;
        if (typeof el.type !== 'string') return false;
        if (typeof el.x !== 'number' || typeof el.y !== 'number') return false;
        return true;
      })
        .map((el: any): ExcalidrawSnapshotElement => ({
        id: String(el.id || ''),
        type: el.type,
        x: el.x,
        y: el.y,
        width: typeof el.width === 'number' ? el.width : 0,
        height: typeof el.height === 'number' ? el.height : 0,
        angle: typeof el.angle === 'number' ? el.angle : undefined,
        strokeColor: typeof el.strokeColor === 'string' ? el.strokeColor : undefined,
        strokeWidth: typeof el.strokeWidth === 'number' ? el.strokeWidth : undefined,
        backgroundColor: typeof el.backgroundColor === 'string' ? el.backgroundColor : undefined,
        fillStyle: typeof el.fillStyle === 'string' ? el.fillStyle : undefined,
        opacity: typeof el.opacity === 'number' ? el.opacity : undefined,
        points: Array.isArray(el.points) ? el.points : undefined,
        isDeleted: false,
        customData: typeof el.customData === 'object' && el.customData ? el.customData : undefined,
        // Capture text and font fields explicitly so thumbnails can render textual elements
        text: typeof el.text === 'string' ? el.text : undefined,
        fontSize: typeof el.fontSize === 'number' ? el.fontSize : undefined,
        fontFamily: typeof el.fontFamily === 'string' ? el.fontFamily : undefined,
        // Prefer strokeColor for text color if available
        textColor: typeof el.strokeColor === 'string' ? el.strokeColor : undefined,
        fileId: typeof el.fileId === 'string' ? el.fileId : undefined,
        scale: Array.isArray(el.scale) && el.scale.length >= 2 && el.scale.every((value: unknown) => typeof value === 'number')
          ? [el.scale[0], el.scale[1]]
          : undefined,
        status: typeof el.status === 'string' ? el.status : undefined,
      }));

    const referencedFileIds = new Set(
      elements
        .filter((el) => el.type === 'image' && typeof el.fileId === 'string')
        .map((el) => String(el.fileId)),
    );

    const files: Record<string, ExcalidrawSnapshotFile> = {};
    if (rawFiles && typeof rawFiles === 'object') {
      for (const [id, value] of Object.entries(rawFiles as Record<string, unknown>)) {
        if (!referencedFileIds.has(id)) continue;
        if (!value || typeof value !== 'object') continue;
        const candidate = value as Record<string, unknown>;
        files[id] = {
          id,
          dataURL: typeof candidate.dataURL === 'string' ? candidate.dataURL : undefined,
          mimeType: typeof candidate.mimeType === 'string' ? candidate.mimeType : undefined,
          created: typeof candidate.created === 'number' ? candidate.created : undefined,
          lastRetrieved: typeof candidate.lastRetrieved === 'number' ? candidate.lastRetrieved : undefined,
        };
      }
    }

    doc.destroy();
    return { elements, files };
  } catch (err) {
    console.warn('[WB-HTTP] fetchExcalidrawScene error', { boardId, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function createWhiteboardRouter({ db }: { db: Knex }) {
  if (!db) throw new Error('db is required');

  const router = express.Router();
  let roomsUpdatedAtColumnPromise: Promise<boolean> | null = null;

  const hasRoomsUpdatedAtColumn = () => {
    if (!roomsUpdatedAtColumnPromise) {
      roomsUpdatedAtColumnPromise = db.schema.hasColumn('rooms', 'updated_at').catch(() => false);
    }
    return roomsUpdatedAtColumnPromise;
  };

  const normalizeTimestamp = (value: unknown): string | null => {
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    return null;
  };

  const normalizeRoomSnapshot = (room: Record<string, unknown> | null | undefined) => {
    if (!room || typeof room.id !== 'string') {
      return null;
    }

    return {
      id: room.id,
      name: typeof room.name === 'string' ? room.name : null,
      created_by: typeof room.created_by === 'string' ? room.created_by : null,
      created_at: normalizeTimestamp(room.created_at),
      updated_at: normalizeTimestamp(room.updated_at),
      type: typeof room.type === 'string' ? room.type : null,
      metadata: room.metadata ?? null,
      is_group: typeof room.is_group === 'boolean' ? room.is_group : null,
    };
  };

  const mergeRoomSnapshot = (
    primary: ReturnType<typeof normalizeRoomSnapshot>,
    secondary: ReturnType<typeof normalizeRoomSnapshot>,
  ) => {
    const base = secondary ?? primary;
    if (!base) return null;

    return {
      id: base.id,
      name: secondary?.name ?? primary?.name ?? null,
      created_by: secondary?.created_by ?? primary?.created_by ?? null,
      created_at: secondary?.created_at ?? primary?.created_at ?? null,
      updated_at: secondary?.updated_at ?? primary?.updated_at ?? null,
      type: secondary?.type ?? primary?.type ?? null,
      metadata: secondary?.metadata ?? primary?.metadata ?? null,
      is_group: secondary?.is_group ?? primary?.is_group ?? null,
    };
  };

  const fetchSupabaseRoomSnapshots = async (roomIds: string[]) => {
    const snapshots = new Map<string, NonNullable<ReturnType<typeof normalizeRoomSnapshot>>>();

    if (process.env.NODE_ENV === 'test' || roomIds.length === 0) {
      return snapshots;
    }

    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, name, created_by, created_at, updated_at, type, metadata, is_group')
        .in('id', roomIds);

      if (error) {
        console.warn('[WB-HTTP] room-snapshot:fallback-failed', {
          roomIds,
          code: error.code,
          message: error.message,
        });
        return snapshots;
      }

      for (const row of Array.isArray(data) ? data : []) {
        const snapshot = normalizeRoomSnapshot(row as Record<string, unknown>);
        if (snapshot) {
          snapshots.set(snapshot.id, snapshot);
        }
      }
    } catch (error) {
      console.warn('[WB-HTTP] room-snapshot:fallback-error', {
        roomIds,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return snapshots;
  };

  const buildPayload = async (boardId: string) => {
    const { events, cursor } = await fetchHistory(db, boardId);
    console.log('[WB-HTTP] history rows', { boardId, count: events.length, lastSeq: cursor.lastSeq });
    const mapped = events
      .map((evt) => {
        const x = normalizeNumber(evt.x);
        const y = normalizeNumber(evt.y);
        const t = normalizeNumber(evt.t);
        if (x === null || y === null || t === null) return null;
        return {
          type: evt.event_type,
          boardId,
          strokeId: evt.stroke_id,
          x,
          y,
          t,
          seq: normalizeSeq(evt.id) ?? undefined,
          segmentIndex: typeof evt.segment_index === 'number' ? evt.segment_index : undefined,
          color: evt.color ?? undefined,
          width: evt.width ?? undefined,
          sourceId: evt.source_id ?? undefined,
        };
      })
      .filter((evt): evt is NonNullable<typeof evt> => Boolean(evt));

    // Excalidraw scene data can contain text and image elements that are not present
    // in the legacy stroke history, so always include the latest scene layer.
    let excalidrawElements: ExcalidrawSnapshotElement[] | undefined;
    let excalidrawFiles: Record<string, ExcalidrawSnapshotFile> | undefined;
    const scene = await fetchExcalidrawScene(db, boardId);
    if (scene?.elements.length) {
      excalidrawElements = scene.elements;
      excalidrawFiles = Object.keys(scene.files).length > 0 ? scene.files : undefined;
      console.log('[WB-HTTP] excalidraw scene from ydoc', {
        boardId,
        elementCount: scene.elements.length,
        fileCount: excalidrawFiles ? Object.keys(excalidrawFiles).length : 0,
      });
    }

    return { boardId, events: mapped, cursor, excalidrawElements, excalidrawFiles };
  };

  const handleRequest = async (req: AuthenticatedRequest, res: Response): Promise<string | null> => {
    const userId = req.user?.id ? String(req.user.id) : null;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return null;
    }

    const boardId = req.validated?.params?.boardId;
    if (!boardId) {
      res.status(400).json({ success: false, error: 'Invalid request' });
      return null;
    }

    const allowed = await isMember(db, boardId, userId);
    if (!allowed) {
      console.warn('[WB-HTTP] not-member', { boardId, userId });
      res.status(404).json({ success: false, error: 'Not found' });
      return null;
    }

    return boardId;
  };

  const buildRoomDetails = async (boardId: string) => {
    const hasUpdatedAt = await hasRoomsUpdatedAtColumn();
    const columns = hasUpdatedAt
      ? ['id', 'name', 'created_by', 'created_at', 'updated_at']
      : ['id', 'name', 'created_by', 'created_at'];

    const room = await db('rooms').select(columns).where({ id: boardId }).first();
    const primaryRoom = normalizeRoomSnapshot((room as Record<string, unknown> | undefined) ?? null);
    const supabaseRooms = await fetchSupabaseRoomSnapshots([boardId]);
    return mergeRoomSnapshot(primaryRoom, supabaseRooms.get(boardId) ?? null);
  };

  router.get(
    '/:boardId([0-9a-fA-F-]{36})',
    validateRequest({ params: BoardIdParamsSchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const boardId = await handleRequest(req, res);
        if (!boardId) return undefined;

        const room = await buildRoomDetails(boardId);
        if (!room) {
          return res.status(404).json({ success: false, error: 'Not found' });
        }

        return res.status(200).json(room);
      } catch (error) {
        console.error('[WB-HTTP] details failed', { error });
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  router.get(
    '/:boardId/history',
    validateRequest({ params: BoardIdParamsSchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const boardId = await handleRequest(req, res);
        if (!boardId) return undefined;
        console.log('[WB-HTTP] history request', { boardId, userId: req.user?.id });
        const payload = await buildPayload(boardId);
        console.log('[WB-HTTP] history response', { boardId, count: payload.events.length, lastSeq: payload.cursor.lastSeq });

        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Vary', 'Accept-Encoding');

        if (shouldGzip(req)) {
          try {
            const json = JSON.stringify(payload);
            const compressed = await gzipAsync(json);
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.status(200).send(compressed);
          } catch {
            // Fall back to uncompressed JSON if gzip fails.
          }
        }

        return res.json(payload);
      } catch {
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  router.post(
    '/:boardId/invites',
    validateRequest({ params: BoardIdParamsSchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user?.id ? String(req.user.id) : null;
        if (!userId) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const boardId = req.validated?.params?.boardId;
        if (!boardId) {
          return res.status(400).json({ success: false, error: 'Invalid request' });
        }

        const owner = await isBoardOwner(db, boardId, userId);
        if (!owner) {
          return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        let room = await db('rooms').select('id').where({ id: boardId }).first();
        if (!room) {
          console.warn('[WB-JOIN] invite-create-room-missing', { boardId, userId, source: 'primary_db' });

          const hydrated = await hydrateMissingRoomForInvite(db, boardId, userId);
          if (!hydrated) {
            return res.status(404).json({ success: false, error: 'Not found', reason: 'room_not_found' });
          }

          room = await db('rooms').select('id').where({ id: boardId }).first();
          if (!room) {
            console.warn('[WB-JOIN] invite-create-room-missing-after-hydrate', { boardId, userId });
            return res.status(404).json({ success: false, error: 'Not found', reason: 'room_not_found' });
          }
        }

        const rawToken = makeInviteToken();
        const tokenHash = hashInviteToken(rawToken);
        const expiresAt = new Date(Date.now() + JOIN_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

        await db('whiteboard_invites').insert({
          room_id: boardId,
          token_hash: tokenHash,
          created_by: userId,
          expires_at: expiresAt,
          max_uses: JOIN_INVITE_DEFAULT_MAX_USES,
          uses: 0,
        });

        // Construct a frontend URL so opening the link in a browser navigates
        // to the React app which will attach the user's auth token and call
        // the backend API properly. Prefer `Origin` header, then env override,
        // then fall back to request host.
        const frontendOrigin = req.get('origin') || process.env.FRONTEND_URL || (req.get('host') ? `${req.protocol}://${req.get('host')}` : '');
        const joinPath = `/whiteboards/${boardId}/join`;
        const joinUrl = frontendOrigin
          ? `${frontendOrigin}${joinPath}?token=${encodeURIComponent(rawToken)}`
          : `${joinPath}?token=${encodeURIComponent(rawToken)}`;

        console.info('[WB-JOIN] invite-created', {
          boardId,
          userId,
          expiresAt: expiresAt.toISOString(),
        });

        return res.status(201).json({ joinUrl, expiresAt: expiresAt.toISOString() });
      } catch (error) {
        if (isInviteRoomForeignKeyError(error)) {
          console.warn('[WB-JOIN] invite-create-fk-room-missing', { boardId: req.validated?.params?.boardId, userId: req.user?.id });
          return res.status(404).json({ success: false, error: 'Not found', reason: 'room_not_found' });
        }

        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  router.post(
    '/join',
    validateRequest({ body: JoinInviteBodySchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.user?.id ? String(req.user.id) : null;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const token = req.validated?.body?.token;
      if (!token) {
        return res.status(400).json({ success: false, error: 'Invalid request', reason: 'invalid_token' });
      }

      try {
        const tokenHash = hashInviteToken(token);
        const invite = (await db<WhiteboardInviteRow>('whiteboard_invites')
          .where({ token_hash: tokenHash })
          .first()) ?? null;

        const validationReason = getJoinInviteFailureReason(invite);
        if (validationReason) {
          if (validationReason === 'used_up' && invite) {
            const alreadyMember = await isMember(db, invite.room_id, userId);
            if (alreadyMember) {
              console.info('[WB-JOIN] join-attempt', {
                ok: true,
                reason: 'already_joined',
                roomId: invite.room_id,
                userId,
                tokenLength: token.length,
              });
              return res.status(200).json({ roomId: invite.room_id });
            }
          }

          console.info('[WB-JOIN] join-attempt', {
            ok: false,
            reason: validationReason,
            userId,
            tokenLength: token.length,
          });
          return res.status(400).json({ success: false, error: 'Join link is not valid', reason: validationReason });
        }

        let room = await db('rooms').select('id').where({ id: invite.room_id }).first();
        if (!room) {
          console.warn('[WB-JOIN] join-room-missing', { roomId: invite.room_id, userId });
          const hydrated = await hydrateMissingRoomForJoin(db, invite.room_id, invite.created_by ?? null);
          if (!hydrated) {
            return res.status(404).json({ success: false, error: 'Not found', reason: 'room_not_found' });
          }

          room = await db('rooms').select('id').where({ id: invite.room_id }).first();
          if (!room) {
            return res.status(404).json({ success: false, error: 'Not found', reason: 'room_not_found' });
          }
        }

        const updateResult = await db('whiteboard_invites')
          .where({ id: invite.id })
          .whereNull('revoked_at')
          .andWhere('expires_at', '>', db.fn.now())
          .andWhereRaw('uses < max_uses')
          .increment('uses', 1);

        if (toAffectedRows(updateResult) < 1) {
          console.info('[WB-JOIN] join-attempt', {
            ok: false,
            reason: 'used_up',
            userId,
            roomId: invite.room_id,
            tokenLength: token.length,
          });
          return res.status(400).json({ success: false, error: 'Join link is no longer usable', reason: 'used_up' });
        }

        await ensureRoomMembershipWithFallback(db, invite.room_id, userId, false, {
          localFkUserMissing: '[WB-JOIN] join-membership-local-fk-user-missing',
          supabaseFallbackFailed: '[WB-JOIN] join-membership-supabase-fallback-failed',
          supabaseFallbackSuccess: '[WB-JOIN] join-membership-supabase-fallback-success',
        });

        console.info('[WB-JOIN] join-attempt', {
          ok: true,
          reason: null,
          roomId: invite.room_id,
          userId,
          tokenLength: token.length,
        });

        return res.status(200).json({ roomId: invite.room_id });
      } catch {
        console.info('[WB-JOIN] join-attempt', {
          ok: false,
          reason: 'unknown',
          userId,
          tokenLength: token.length,
        });
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  router.get('/help-requests', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : '';
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      if (!isTutorOrAdmin(req)) {
        return res.status(403).json({ success: false, error: 'Tutor access required' });
      }

      const requestedStatus = typeof req.query?.status === 'string' ? req.query.status.trim().toLowerCase() : 'pending';
      const status = requestedStatus === 'claimed' ? 'claimed' : 'pending';
      const mine = String(req.query?.mine || '').toLowerCase() === 'true';

      let query = db('whiteboard_help_requests as hr')
        .leftJoin('rooms as r', 'hr.board_id', 'r.id')
        .leftJoin('users as student_user', 'hr.student_user_id', 'student_user.id')
        .leftJoin('users as tutor_user', 'hr.claimed_by_user_id', 'tutor_user.id')
        .select(
          'hr.id',
          'hr.board_id',
          'hr.student_user_id',
          'hr.claimed_by_user_id',
          'hr.status',
          'hr.request_text',
          'hr.problem_draft',
          'hr.created_at',
          'hr.updated_at',
          'hr.claimed_at',
          'hr.resolved_at',
          'r.name as board_name',
          'student_user.username as student_username',
          'tutor_user.username as claimed_by_username',
        )
        .where('hr.status', status)
        .orderBy('hr.created_at', 'asc');

      if (status === 'claimed' && mine && req.user?.role !== 'admin') {
        query = query.where('hr.claimed_by_user_id', userId);
      }

      const rows = await query;
      return res.status(200).json((rows as WhiteboardHelpRequestRow[]).map((row) => normalizeHelpRequest(row)));
    } catch (error) {
      console.error('[WB-HELP] queue-list failed', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  router.get(
    '/:boardId/help-requests/active',
    validateRequest({ params: BoardIdParamsSchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const boardId = await handleRequest(req, res);
        if (!boardId) return undefined;

        const helpRequest = await fetchActiveHelpRequestForBoard(db, boardId);
        if (!helpRequest) {
          return res.status(200).json(null);
        }

        return res.status(200).json(helpRequest);
      } catch (error) {
        console.error('[WB-HELP] active-fetch failed', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    },
  );

  router.post(
    '/:boardId/help-requests',
    validateRequest({ params: BoardIdParamsSchema, body: WhiteboardHelpRequestBodySchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const boardId = await handleRequest(req, res);
        if (!boardId) return undefined;

        const userId = req.user?.id ? String(req.user.id) : '';
        if (!userId) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        if (isTutorOrAdmin(req)) {
          return res.status(403).json({ success: false, error: 'Students create help requests; tutors use the queue.' });
        }

        const existing = await fetchActiveHelpRequestForBoard(db, boardId);
        if (existing) {
          return res.status(409).json({ success: false, error: 'This whiteboard already has an active help request.', data: existing });
        }

        const localRoom = await db('rooms').select('id').where({ id: boardId }).first();
        if (!localRoom) {
          const hydrated = await hydrateMissingRoomForJoin(db, boardId, null);
          if (!hydrated) {
            return res.status(404).json({ success: false, error: 'Not found', reason: 'room_not_found' });
          }
        }

        await ensureLocalUserShadow(db, userId);

        const body = req.body as z.infer<typeof WhiteboardHelpRequestBodySchema>;
        const requestText = body.requestText?.trim() || 'Help requested on this whiteboard.';
        const problemDraft = body.problemDraft?.trim() || null;

        const inserted = await db('whiteboard_help_requests')
          .insert({
            board_id: boardId,
            student_user_id: userId,
            request_text: requestText,
            problem_draft: problemDraft,
            status: 'pending',
            created_at: db.fn.now(),
            updated_at: db.fn.now(),
          })
          .returning('id');

        const firstInserted = Array.isArray(inserted) ? inserted[0] : inserted;
        const requestId = typeof firstInserted === 'string'
          ? firstInserted
          : String(firstInserted?.id ?? '');

        const created = await fetchHelpRequestById(db, requestId);
        return res.status(201).json(created);
      } catch (error) {
        console.error('[WB-HELP] create failed', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    },
  );

  router.post(
    '/help-requests/:requestId/claim',
    validateRequest({ params: HelpRequestIdParamsSchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user?.id ? String(req.user.id) : '';
        if (!userId) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        if (!isTutorOrAdmin(req)) {
          return res.status(403).json({ success: false, error: 'Tutor access required' });
        }

        const requestId = req.validated?.params?.requestId;
        if (!requestId) {
          return res.status(400).json({ success: false, error: 'Invalid request' });
        }

        const existing = await fetchHelpRequestById(db, requestId);
        if (!existing) {
          return res.status(404).json({ success: false, error: 'Help request not found' });
        }

        if (existing.status === 'resolved' || existing.status === 'cancelled') {
          return res.status(409).json({ success: false, error: 'This help request is no longer active.' });
        }

        if (existing.status === 'claimed' && existing.claimedByUserId && existing.claimedByUserId !== userId && req.user?.role !== 'admin') {
          return res.status(409).json({ success: false, error: 'This help request has already been claimed.' });
        }

        await db.transaction(async (trx) => {
          await trx('whiteboard_help_requests')
            .where({ id: requestId })
            .update({
              status: 'claimed',
              claimed_by_user_id: userId,
              claimed_at: trx.fn.now(),
              updated_at: trx.fn.now(),
            });

          const membership = await trx('room_members')
            .where({ room_id: existing.boardId, user_id: userId })
            .first();

          if (!membership) {
            await ensureRoomMembershipWithFallback(trx as Knex, existing.boardId, userId, false, {
              localFkUserMissing: '[WB-HELP] claim-membership-local-fk-user-missing',
              supabaseFallbackFailed: '[WB-HELP] claim-membership-supabase-fallback-failed',
              supabaseFallbackSuccess: '[WB-HELP] claim-membership-supabase-fallback-success',
            });
          }
        });

        const claimed = await fetchHelpRequestById(db, requestId);
        return res.status(200).json(claimed);
      } catch (error) {
        console.error('[WB-HELP] claim failed', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    },
  );

  router.patch(
    '/help-requests/:requestId/resolve',
    validateRequest({ params: HelpRequestIdParamsSchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user?.id ? String(req.user.id) : '';
        if (!userId) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        if (!isTutorOrAdmin(req)) {
          return res.status(403).json({ success: false, error: 'Tutor access required' });
        }

        const requestId = req.validated?.params?.requestId;
        if (!requestId) {
          return res.status(400).json({ success: false, error: 'Invalid request' });
        }

        const existing = await fetchHelpRequestById(db, requestId);
        if (!existing) {
          return res.status(404).json({ success: false, error: 'Help request not found' });
        }

        if (req.user?.role !== 'admin' && existing.claimedByUserId && existing.claimedByUserId !== userId) {
          return res.status(403).json({ success: false, error: 'Only the claimed tutor can resolve this help request.' });
        }

        await db('whiteboard_help_requests')
          .where({ id: requestId })
          .update({
            status: 'resolved',
            resolved_at: db.fn.now(),
            updated_at: db.fn.now(),
          });

        const resolved = await fetchHelpRequestById(db, requestId);
        return res.status(200).json(resolved);
      } catch (error) {
        console.error('[WB-HELP] resolve failed', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    },
  );

  router.post(
    '/:boardId/tutor',
    validateRequest({ params: BoardIdParamsSchema, body: WhiteboardTutorBodySchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const boardId = await handleRequest(req, res);
        if (!boardId) return undefined;

        if (!isTutorOrAdmin(req)) {
          return res.status(403).json({ success: false, error: 'Tutor access required' });
        }

        const body = req.body as WhiteboardTutorBody;
        logMathEngine('request received', {
          boardId,
          inputMode: body.inputMode ?? 'photo',
          mode: body.mode ?? 'analysis',
          modelTier: body.modelTier ?? 'standard',
          messageCount: body.messages?.length ?? 0,
          skipCache: Boolean(body.skipCache),
        });
        const modelConfig = getConfiguredTutorModelConfig(body);
        if (modelConfig.requestedTier === 'stronger' && !modelConfig.strongerModelAvailable) {
          return res.status(409).json({ success: false, error: 'A stronger tutor model is not configured for this request.' });
        }

        const cachedTutorResponse = await readWhiteboardTutorCache(db, boardId, body);
        if (cachedTutorResponse) {
          const messages = [...(body.messages ?? []), { role: 'assistant', content: cachedTutorResponse.reply }];
          tutorFixDebug('assistant-data-source', {
            boardId,
            source: 'server-cache',
          });
          tutorFixDebug('server analysis response summary', {
            boardId,
            cacheSource: 'server-cache',
            problemText: cachedTutorResponse.analysisResult?.problemText ?? cachedTutorResponse.problem ?? '',
            stepCount: cachedTutorResponse.analysisResult?.steps?.length ?? cachedTutorResponse.steps?.length ?? 0,
          });
          logMathEngine('response sent', {
            boardId,
            cacheSource: 'server-cache',
            fallbackUsed: cachedTutorResponse.mathFacts ? isMathEngineFallbackUsed(cachedTutorResponse.mathFacts) : null,
            compactPayloadSummary: buildMathEnginePayloadSummary(cachedTutorResponse),
          });
          return res.status(200).json({ ...withTutorCacheSource(cachedTutorResponse, 'server-cache'), messages, boardId });
        }

        const tutorResponse = await callWhiteboardTutor(boardId, body);
        await writeWhiteboardTutorCache(db, boardId, body, tutorResponse);
        const messages = [...(body.messages ?? []), { role: 'assistant', content: tutorResponse.reply }];
        tutorFixDebug('assistant-data-source', {
          boardId,
          source: 'fresh',
        });
        tutorFixDebug('server analysis response summary', {
          boardId,
          cacheSource: 'fresh',
          problemText: tutorResponse.analysisResult.problemText,
          stepCount: tutorResponse.analysisResult.steps.length,
        });
        logMathEngine('response sent', {
          boardId,
          cacheSource: 'fresh',
          fallbackUsed: tutorResponse.mathFacts ? isMathEngineFallbackUsed(tutorResponse.mathFacts) : null,
          compactPayloadSummary: buildMathEnginePayloadSummary(tutorResponse),
        });

        return res.status(200).json({ ...withTutorCacheSource(tutorResponse, 'fresh'), messages, boardId });
      } catch (error) {
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error && typeof (error as { statusCode?: unknown }).statusCode === 'number'
            ? Number((error as { statusCode?: unknown }).statusCode)
            : 500;
        const message = error instanceof Error ? error.message : 'Internal server error';
        const pipelineError = error as TutorPipelineError;
        console.error('[WB-TUTOR] request failed', {
          boardId: req.validated?.params?.boardId,
          statusCode,
          stage: pipelineError?.stage ?? 'unknown',
          provider: pipelineError?.provider ?? 'unknown',
          model: pipelineError?.model ?? 'unknown',
          message,
        });
        return res.status(statusCode).json({ success: false, error: message });
      }
    },
  );

  router.post(
    '/:boardId/ws-token',
    validateRequest({ params: BoardIdParamsSchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        console.log('[WB-HTTP] ws-token request', {
          boardId: req.validated?.params?.boardId,
          userId: req.user?.id,
          path: req.originalUrl,
        });
        const boardId = await handleRequest(req, res);
        if (!boardId) return undefined;
        const userId = req.user?.id ? String(req.user.id) : '';
        const ticket = createWhiteboardWsToken({ boardId, userId });
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ success: true, token: ticket.token, expiresInMs: ticket.expiresInMs });
      } catch {
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    },
  );

  router.get(
    '/:boardId/snapshot',
    validateRequest({ params: BoardIdParamsSchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const boardId = await handleRequest(req, res);
        if (!boardId) return undefined;
        console.log('[WB-HTTP] snapshot request', { boardId, userId: req.user?.id });
        const payload = await buildPayload(boardId);
        console.log('[WB-HTTP] snapshot response', { boardId, count: payload.events.length, lastSeq: payload.cursor.lastSeq });

        if (shouldGzip(req)) {
          try {
            // perf: gzip large snapshot responses when the client accepts it.
            const json = JSON.stringify(payload);
            const compressed = await gzipAsync(json);
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Vary', 'Accept-Encoding');
            return res.status(200).send(compressed);
          } catch {
            // Fall back to uncompressed JSON if gzip fails.
          }
        }

        res.setHeader('Cache-Control', 'no-store');
        return res.json(payload);
      } catch {
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  // Hub list: return rooms the authenticated user is a member of, including owner details and participants
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log('[WB-HUB] GET /api/whiteboards called', { path: req.path, user: req.user && typeof req.user.id === 'string' ? req.user.id : null });
      const userId = req.user?.id ? String(req.user.id) : null;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const memberRows = await db('room_members').select('room_id').where({ user_id: userId });
      const roomIds = Array.from(new Set((memberRows ?? []).map((r: any) => String((r as Record<string, unknown>).room_id)).filter(Boolean)));
      if (!roomIds.length) return res.json([]);

      // Fetch rooms in one query
      let rooms: Array<any> = [];
      try {
        rooms = await db('rooms')
          .select('id', 'name', 'is_group', 'created_at', 'updated_at', 'type', 'metadata', 'created_by')
          .whereIn('id', roomIds as string[]);
      } catch (error) {
        if (!isMissingColumnError(error, 'updated_at')) throw error;

        rooms = await db('rooms')
          .select('id', 'name', 'is_group', 'created_at', db.raw('created_at as updated_at'), 'type', 'metadata', 'created_by')
          .whereIn('id', roomIds as string[]);
      }
      const supabaseRoomsById = await fetchSupabaseRoomSnapshots(roomIds as string[]);

      // Fetch all members for these rooms in one query to avoid N+1
      const allMembers = await db('room_members').select('room_id', 'user_id', 'is_owner').whereIn('room_id', roomIds as string[]);
      const userIds = Array.from(new Set(allMembers.map((m: any) => String(m.user_id))));

      // Fetch user profiles for participants
      const users = userIds.length
        ? await db('users').select('id', 'username', 'avatar_url').whereIn('id', userIds as string[])
        : [];

      const usersById = new Map<string, { id: string; username: string | null; avatar_url: string | null }>();
      for (const u of users as Array<{ id?: unknown; username?: unknown; avatar_url?: unknown }>) {
        if (typeof u.id !== 'string') continue;
        usersById.set(u.id, { id: u.id, username: typeof u.username === 'string' ? u.username : null, avatar_url: typeof u.avatar_url === 'string' ? u.avatar_url : null });
      }

      const membersByRoom = new Map<string, Array<{ user_id: string; is_owner: boolean }>>();
      for (const m of allMembers as Array<{ room_id?: unknown; user_id?: unknown; is_owner?: unknown }>) {
        if (typeof m.room_id !== 'string' || typeof m.user_id !== 'string') continue;
        const list = membersByRoom.get(m.room_id) ?? [];
        list.push({ user_id: m.user_id, is_owner: Boolean(m.is_owner) });
        membersByRoom.set(m.room_id, list);
      }

      const hubItems = (rooms as Array<any>)
        .map((r) => {
          const roomId = String(r.id);
          const roomSnapshot = mergeRoomSnapshot(
            normalizeRoomSnapshot(r as Record<string, unknown>),
            supabaseRoomsById.get(roomId) ?? null,
          );
          const members = membersByRoom.get(roomId) ?? [];
          // Determine owner: prefer explicit is_owner flag, fall back to created_by
          const ownerMember = members.find((m) => m.is_owner) ?? null;
          const ownerId = ownerMember ? ownerMember.user_id : roomSnapshot?.created_by ?? null;
          const ownerProfile = ownerId ? usersById.get(ownerId) ?? { id: ownerId, username: null, avatar_url: null } : null;

          const participants = members
            .map((m) => {
              const profile = usersById.get(m.user_id) ?? { id: m.user_id, username: null, avatar_url: null };
              return { id: m.user_id, username: profile.username, avatar_url: profile.avatar_url };
            })
            .filter(Boolean);

          return {
            id: roomId,
            name: roomSnapshot?.name ?? null,
            created_at: roomSnapshot?.created_at ?? null,
            updated_at: roomSnapshot?.updated_at ?? roomSnapshot?.created_at ?? null,
            type: roomSnapshot?.type ?? null,
            metadata: roomSnapshot?.metadata ?? null,
            owner: ownerProfile ? { id: ownerProfile.id, username: ownerProfile.username, avatar_url: ownerProfile.avatar_url } : null,
            participants,
          };
        })
        // newest first
        .sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at));

      return res.json(hubItems);
    } catch (err) {
      console.error('[WB-HUB] list failed', { error: err });
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // PUT: update whiteboard name (owner only)
  router.put('/:boardId', validateRequest({ params: BoardIdParamsSchema }), async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log('[WB-HTTP] PUT /api/whiteboards/:boardId called', { path: req.path, user: req.user && typeof req.user.id === 'string' ? req.user.id : null });
      const userId = req.user?.id ? String(req.user.id) : null;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const boardId = req.validated?.params?.boardId;
      if (!boardId) return res.status(400).json({ success: false, error: 'Invalid request' });

      const { name } = req.body || {};
      if (!name || typeof name !== 'string') return res.status(400).json({ success: false, error: 'Name is required' });
      
      const trimmedName = name.trim();
      if (!trimmedName) return res.status(400).json({ success: false, error: 'Name cannot be empty' });
      if (trimmedName.length > 100) return res.status(400).json({ success: false, error: 'Name too long' });

      const owner = await isBoardOwner(db, boardId, userId);
      if (!owner) return res.status(403).json({ success: false, error: 'Forbidden' });

      const updatedAt = new Date().toISOString();
      const hasUpdatedAt = await hasRoomsUpdatedAtColumn();

      let updated: unknown;
      try {
        updated = await db('rooms').where({ id: boardId }).update(
          hasUpdatedAt
            ? { name: trimmedName, updated_at: updatedAt }
            : { name: trimmedName }
        );
      } catch (error) {
        if (!isMissingColumnError(error, 'updated_at')) throw error;
        updated = await db('rooms').where({ id: boardId }).update({ name: trimmedName });
      }

      if (process.env.NODE_ENV !== 'test') {
        const { error } = await supabase
          .from('rooms')
          .update({ name: trimmedName, updated_at: updatedAt })
          .eq('id', boardId);

        if (error) {
          console.warn('[WB-HTTP] rename:supabase-sync-failed', {
            boardId,
            userId,
            code: error.code,
            message: error.message,
          });
        }
      }

      if (toAffectedRows(updated) === 0) {
        // Local dev can run with a split data plane where API DB and Supabase aren't the same.
        // In that case, persist rename directly to Supabase instead of returning false success.
        const { data: fallbackRow, error: fallbackError } = await supabase
          .from('rooms')
          .update({ name: trimmedName, updated_at: updatedAt })
          .eq('id', boardId)
          .select('id')
          .maybeSingle();

        if (fallbackError) {
          console.warn('[WB-HTTP] update fallback failed', {
            boardId,
            userId,
            code: fallbackError.code,
            message: fallbackError.message,
          });
          return res.status(500).json({ success: false, error: 'Unable to persist whiteboard name' });
        }

        if (!fallbackRow?.id) {
          return res.status(404).json({ success: false, error: 'Whiteboard not found' });
        }

        console.log('[WB-HTTP] update fallback applied', { boardId, userId });
      }

      return res.status(200).json({ success: true, name: trimmedName });
    } catch (err) {
      console.error('[WB-HTTP] update failed', { error: err });
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // DELETE: delete a whiteboard (owner only)
  router.delete('/:boardId', validateRequest({ params: BoardIdParamsSchema }), async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log('[WB-HTTP] DELETE /api/whiteboards/:boardId called', { path: req.path, user: req.user && typeof req.user.id === 'string' ? req.user.id : null });
      const userId = req.user?.id ? String(req.user.id) : null;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const boardId = req.validated?.params?.boardId;
      if (!boardId) return res.status(400).json({ success: false, error: 'Invalid request' });

      const owner = await isBoardOwner(db, boardId, userId);
      if (!owner) return res.status(403).json({ success: false, error: 'Forbidden' });

      let deletedPrimaryRoom = false;

      // perform clean delete in transaction
      await db.transaction(async (trx) => {
        const hasWhiteboardDocuments = await trx.schema.hasTable(WHITEBOARD_DOC_TABLE);
        if (hasWhiteboardDocuments) {
          await trx(WHITEBOARD_DOC_TABLE).where({ board_id: boardId }).del();
        }
        await trx('whiteboard_events').where({ board_id: boardId }).del();
        await trx('whiteboard_invites').where({ room_id: boardId }).del();
        await trx('room_members').where({ room_id: boardId }).del();
        const deletedRooms = await trx('rooms').where({ id: boardId }).del();
        deletedPrimaryRoom = toAffectedRows(deletedRooms) > 0;
      });

      let deletedFallbackRoom = false;
      if (process.env.NODE_ENV !== 'test') {
        deletedFallbackRoom = await deleteWhiteboardFromSupabase(boardId);
      }

      if (!deletedPrimaryRoom && !deletedFallbackRoom) {
        return res.status(404).json({ success: false, error: 'Whiteboard not found' });
      }

      return res.status(204).send();
    } catch (err) {
      console.error('[WB-HTTP] delete failed', { error: err });
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // DELETE: leave a whiteboard (remove own membership)
  router.delete('/:boardId/leave', validateRequest({ params: BoardIdParamsSchema }), async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log('[WB-HTTP] DELETE /api/whiteboards/:boardId/leave called', { path: req.path, user: req.user && typeof req.user.id === 'string' ? req.user.id : null });
      const userId = req.user?.id ? String(req.user.id) : null;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const boardId = req.validated?.params?.boardId;
      if (!boardId) return res.status(400).json({ success: false, error: 'Invalid request' });

      const existing = await db('room_members').where({ room_id: boardId, user_id: userId }).first();
      if (!existing) {
        // If membership isn't in primary DB, attempt Supabase fallback to support eventual-consistency dev setups.
        if (process.env.NODE_ENV === 'test') {
          return res.status(404).json({ success: false, error: 'Not found' });
        }

        try {
          const { data: deleted, error: delErr } = await supabase
            .from('room_members')
            .delete()
            .eq('room_id', boardId)
            .eq('user_id', userId);

          if (delErr) {
            console.warn('[WB-HTTP] leave:supabase-delete-failed', { boardId, userId, code: delErr.code, message: delErr.message });
            return res.status(404).json({ success: false, error: 'Not found' });
          }

          // Treat as idempotent: whether Supabase deleted rows or not,
          // respond success to make leave safe to call repeatedly.
          if (Array.isArray(deleted) && deleted.length > 0) {
            console.log('[WB-HTTP] leave:supabase-deleted', { boardId, userId, count: deleted.length });
          } else {
            console.log('[WB-HTTP] leave:supabase-no-op', { boardId, userId });
          }
          return res.status(200).json({ success: true });
        } catch (e) {
          console.error('[WB-HTTP] leave:supabase-fallback-error', { boardId, userId, error: e });
          return res.status(500).json({ success: false, error: 'Internal server error' });
        }
      }

      await db('room_members').where({ room_id: boardId, user_id: userId }).del();
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[WB-HTTP] leave failed', { error: err });
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  return router;
};

module.exports = createWhiteboardRouter;

