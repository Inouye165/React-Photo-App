import { Router, Request } from 'express';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';

const logger = require('../logger');
const { getOrCreateRequestId } = require('../lib/requestId');

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    role?: string;
  };
};

const AnalyzeBodySchema = z.object({
  fen: z.string().min(4).max(120),
  moves: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/i)).max(400).optional(),
});

type GeminiTutorAnalysis = {
  positionSummary: string;
  hints: string[];
  focusAreas: string[];
};

type GeminiErrorInfo = {
  statusCode?: number;
  reason?: string;
  message: string;
};

const DEFAULT_TUTOR_MODEL = 'gemini-1.5-flash';
const TUTOR_FALLBACK_MODELS = ['gemini-1.5-pro', 'gemini-pro'];
const DEFAULT_API_VERSION = 'v1';

class GeminiTutorError extends Error {
  details?: GeminiErrorInfo;

  constructor(message: string, details?: GeminiErrorInfo) {
    super(message);
    this.name = 'GeminiTutorError';
    this.details = details;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeModelNameForSdk(model: string): string {
  return model.trim().replace(/^models\//i, '');
}

function buildModelCandidates(configuredModel: string): string[] {
  const models = [normalizeModelNameForSdk(configuredModel || DEFAULT_TUTOR_MODEL), ...TUTOR_FALLBACK_MODELS];
  return models.filter((model, index) => model && models.indexOf(model) === index);
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

  return {
    statusCode,
    reason,
    message,
  };
}

function isModelNotFoundError(errorInfo: GeminiErrorInfo): boolean {
  const combined = `${errorInfo.reason || ''} ${errorInfo.message}`.toLowerCase();
  return errorInfo.statusCode === 404 || combined.includes('not found') || combined.includes('not supported');
}

function createGeminiModelClient(
  genAI: GoogleGenerativeAI,
  model: string,
): { modelClient: ReturnType<GoogleGenerativeAI['getGenerativeModel']>; apiVersionUsed: string } {
  const preferredApiVersion = (process.env.GEMINI_API_VERSION?.trim() || DEFAULT_API_VERSION).toLowerCase();
  if (preferredApiVersion === 'v1') {
    try {
      const modelClient = genAI.getGenerativeModel({ model, apiVersion: 'v1' } as unknown as { model: string });
      return { modelClient, apiVersionUsed: 'v1' };
    } catch {
      logger.warn('[chess-tutor/analyze] SDK does not accept apiVersion=v1 in model init, using SDK default', {
        model,
      });
    }
  }

  const modelClient = genAI.getGenerativeModel({ model });
  return { modelClient, apiVersionUsed: 'sdk-default' };
}

function parseTutorJson(rawText: string): GeminiTutorAnalysis {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  const jsonCandidate = fenced ? fenced[1] : trimmed;
  const parsed = JSON.parse(jsonCandidate) as Partial<GeminiTutorAnalysis>;

  const positionSummary = typeof parsed.positionSummary === 'string' ? parsed.positionSummary.trim() : '';
  const hints = Array.isArray(parsed.hints)
    ? parsed.hints.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 4)
    : [];
  const focusAreas = Array.isArray(parsed.focusAreas)
    ? parsed.focusAreas.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 4)
    : [];

  if (!positionSummary) {
    throw new Error('Model returned invalid position summary');
  }

  return {
    positionSummary,
    hints,
    focusAreas,
  };
}

async function runGeminiTutorAnalysis({
  apiKey,
  model,
  fen,
  moves,
}: {
  apiKey: string;
  model: string;
  fen: string;
  moves: string[];
}): Promise<{ analysis: GeminiTutorAnalysis; modelUsed: string; apiVersionUsed: string }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelCandidates = buildModelCandidates(model);

  const prompt = [
    'You are a practical chess tutor for a club-level player.',
    'Given the current position FEN and recent UCI moves, return concise coaching as strict JSON.',
    'Output JSON only, with this exact shape:',
    '{"positionSummary":"string","hints":["string"],"focusAreas":["string"]}',
    'Rules:',
    '- positionSummary: 1-3 short sentences.',
    '- hints: up to 4 actionable tactical or strategic hints.',
    '- focusAreas: up to 4 things the player should watch next.',
    '- Do not include markdown or any keys outside the schema.',
    `FEN: ${fen}`,
    `Recent UCI moves: ${moves.join(' ') || 'none'}`,
  ].join('\n');

  let lastError: GeminiErrorInfo | null = null;

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const candidateModel = modelCandidates[index];
    const isLastCandidate = index === modelCandidates.length - 1;

    try {
      const { modelClient, apiVersionUsed } = createGeminiModelClient(genAI, candidateModel);
      const result = await modelClient.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 450,
        },
      });

      const text = result?.response?.text();
      if (!text || typeof text !== 'string') {
        throw new GeminiTutorError('Gemini returned an empty response');
      }

      return {
        analysis: parseTutorJson(text),
        modelUsed: candidateModel,
        apiVersionUsed,
      };
    } catch (error) {
      const errorInfo = extractGeminiErrorInfo(error);
      lastError = errorInfo;

      logger.warn('[chess-tutor/analyze] Gemini model attempt failed', {
        model: candidateModel,
        statusCode: errorInfo.statusCode,
        reason: errorInfo.reason,
        message: errorInfo.message,
      });

      if (!isLastCandidate && isModelNotFoundError(errorInfo)) {
        continue;
      }

      throw new GeminiTutorError(errorInfo.message, errorInfo);
    }
  }

  throw new GeminiTutorError(lastError?.message || 'Gemini analysis failed', lastError || undefined);
}

export default function createChessTutorRouter(): Router {
  const router = Router();

  router.post('/analyze', async (req: AuthenticatedRequest, res) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const parsed = AnalyzeBodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid analysis input' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || '';
    if (!geminiApiKey) {
      return res.status(503).json({ success: false, error: 'GEMINI_API_KEY is not configured' });
    }

    const model = process.env.GEMINI_TUTOR_MODEL?.trim() || DEFAULT_TUTOR_MODEL;

    try {
      const result = await runGeminiTutorAnalysis({
        apiKey: geminiApiKey,
        model,
        fen: parsed.data.fen,
        moves: parsed.data.moves ?? [],
      });

      return res.json({
        success: true,
        analysis: result.analysis,
        model: result.modelUsed,
        apiVersion: result.apiVersionUsed,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chess tutor analysis failed';
      const geminiDetails = error instanceof GeminiTutorError ? error.details : undefined;
      const traceId: string = getOrCreateRequestId(req);

      logger.error('[chess-tutor/analyze] Gemini analysis failed', {
        route: 'POST /api/v1/chess-tutor/analyze',
        traceId,
        userId,
        message,
        statusCode: geminiDetails?.statusCode,
        reason: geminiDetails?.reason,
        providerMessage: geminiDetails?.message,
      });

      // Admin-gated debug details: only when CHESS_TUTOR_DEBUG_ERRORS=true and user is admin.
      // Enable temporarily in production to diagnose 502s, then disable.
      const isAdmin = req.user?.role === 'admin';
      const debugEnabled = process.env.CHESS_TUTOR_DEBUG_ERRORS === 'true';
      const responseBody: Record<string, unknown> = {
        success: false,
        error: 'Failed to analyze position',
      };

      if (debugEnabled && isAdmin && geminiDetails) {
        responseBody.gemini = {
          statusCode: geminiDetails.statusCode,
          reason: geminiDetails.reason,
          message: geminiDetails.message,
          traceId,
        };
      }

      return res.status(502).json(responseBody);
    }
  });

  return router;
}

module.exports = createChessTutorRouter;

export const __testables = {
  normalizeModelNameForSdk,
  buildModelCandidates,
  extractGeminiErrorInfo,
  isModelNotFoundError,
};
