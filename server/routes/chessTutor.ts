import { Router, Request } from 'express';
import { z } from 'zod';

const logger = require('../logger');

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
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
}): Promise<GeminiTutorAnalysis> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 450,
      },
    }),
  });

  const payload = await response.json().catch(() => null) as
    | {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    const message = payload?.error?.message || `Gemini request failed (${response.status})`;
    throw new Error(message);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') {
    throw new Error('Gemini returned an empty response');
  }

  return parseTutorJson(text);
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

    const model = process.env.GEMINI_TUTOR_MODEL?.trim() || 'gemini-1.5-flash';

    try {
      const analysis = await runGeminiTutorAnalysis({
        apiKey: geminiApiKey,
        model,
        fen: parsed.data.fen,
        moves: parsed.data.moves ?? [],
      });

      return res.json({
        success: true,
        analysis,
        model,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chess tutor analysis failed';
      logger.error('[chess-tutor/analyze] Gemini analysis failed', {
        userId,
        message,
      });
      return res.status(502).json({ success: false, error: 'Failed to analyze position' });
    }
  });

  return router;
}

module.exports = createChessTutorRouter;
