const logger = require('../../../logger');

// Deprecated: HITL gate now enforces mandatory review for all identifications
function _getThreshold() {
  const raw = process.env.COLLECTIBLES_REVIEW_THRESHOLD;
  const parsed = raw ? Number(raw) : 0.75;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) return 0.75;
  return parsed;
}

// Deprecated: HITL gate now enforces mandatory review for all identifications
function _forceReviewEnabled() {
  return String(process.env.COLLECTIBLES_FORCE_REVIEW || '').toLowerCase() === 'true';
}

function isoNow() {
  return new Date().toISOString();
}

function isoPlusHours(hours) {
  const ms = Number(hours) * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

function safeTrimString(val) {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed ? trimmed : null;
}

/**
 * HITL gate for collectible identification.
 *
 * Option A (recommended): end early when review is required.
 * - If confidence >= threshold and not forced: auto-confirm and proceed.
 * - If confidence < threshold or forced: set pending review, attach ticketId, and produce a finalResult that indicates pending.
 */
async function confirm_collectible(state) {
  const runId = state.runId || null;

  const current = state.collectible || {};
  const identification = current.identification || null;

  // HITL resume path: if a human override is provided, treat it as confirmed and proceed.
  if (state.collectibleOverride && safeTrimString(state.collectibleOverride.id)) {
    const override = state.collectibleOverride;
    const nextId = safeTrimString(override.id);
    const nextCategory = (override.category !== undefined ? override.category : (identification ? identification.category : null));
    const nextFields = (override.fields !== undefined ? override.fields : (identification ? identification.fields : null));
    const confirmedBy = safeTrimString(override.confirmedBy) || 'user';

    logger.info('[LangGraph] confirm_collectible: Applying human override and confirming', {
      previousId: identification?.id || null,
      nextId,
      nextCategory: nextCategory || null,
      confirmedBy,
    });

    const priorSnapshot = identification ? { ...identification } : null;
    const history = Array.isArray(current.review?.editHistory) ? current.review.editHistory : [];

    return {
      ...state,
      collectible: {
        ...current,
        identification: {
          id: nextId,
          category: nextCategory ?? null,
          confidence: 1,
          fields: nextFields ?? null,
          source: 'human',
        },
        review: {
          status: 'confirmed',
          ticketId: current.review?.ticketId || runId,
          confirmedBy,
          confirmedAt: isoNow(),
          editHistory: history.concat([
            {
              at: isoNow(),
              type: 'identification_override',
              previous: priorSnapshot,
              next: { id: nextId, category: nextCategory ?? null, fields: nextFields ?? null },
            },
          ]),
          version: (current.review?.version ?? 1) + 1,
          expiresAt: current.review?.expiresAt || isoPlusHours(24),
        },
      },
    };
  }

  if (!identification || !identification.id) {
    logger.warn('[LangGraph] confirm_collectible: Missing identification; ending as rejected');
    return {
      ...state,
      collectible: {
        ...current,
        review: {
          status: 'rejected',
          ticketId: runId,
          confirmedBy: null,
          confirmedAt: null,
          editHistory: current.review?.editHistory || [],
          version: current.review?.version ?? 1,
          expiresAt: isoPlusHours(24),
        },
      },
      finalResult: {
        caption: 'Collectible identification unavailable',
        description: 'Collectible identification failed and requires human review.',
        keywords: 'collectible',
        classification: state.classification || 'collectables',
        collectibleInsights: {
          identification: identification,
          review: { status: 'rejected', ticketId: runId },
        },
      },
    };
  }

  // If already confirmed (e.g., resume flow), pass through.
  if (current.review?.status === 'confirmed') {
    logger.info('[LangGraph] confirm_collectible: Already confirmed; pass-through');
    return state;
  }

  // MANDATORY HITL GATE: All AI identifications require human review.
  // Auto-confirmation is disabled regardless of confidence score.
  const confidence = typeof identification.confidence === 'number' ? identification.confidence : null;

  logger.info('[LangGraph] confirm_collectible: HITL gate enforced - requiring human review', {
    id: identification.id,
    category: identification.category,
    confidence,
    note: 'Auto-confirmation disabled - all identifications require approval',
  });

  const ticketId = current.review?.ticketId || runId;

  return {
    ...state,
    collectible: {
      ...current,
      review: {
        status: 'pending',
        ticketId,
        confirmedBy: null,
        confirmedAt: null,
        editHistory: current.review?.editHistory || [],
        version: current.review?.version ?? 1,
        expiresAt: isoPlusHours(24),
      },
    },
    // End-early pattern: produce a final result with identification data for Edit Page.
    finalResult: {
      caption: identification.category ? `${identification.category} (Review Needed)` : 'Collectible (Review Needed)',
      description: 'Human confirmation is required before valuation and description will be generated.',
      keywords: 'collectible,review,pending',
      classification: state.classification || 'collectables',
      collectibleInsights: {
        // Include AI identification so Edit Page can pre-populate the form
        identification: {
          id: identification.id,
          category: identification.category,
          confidence,
          fields: identification.fields || null,
          source: 'ai',
        },
        review: { status: 'pending', ticketId, confidence },
      },
    },
  };
}

module.exports = confirm_collectible;
