const logger = require('../../../logger');

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
 * * Logic:
 * 1. If a 'collectibleOverride' exists (human input), confirm it and proceed.
 * 2. If no override exists, always set status to 'pending' to force a human review.
 * 3. Include the AI identification data and visual matches in the finalResult 
 * so the "Edit Page" can display them for approval.
 */
async function confirm_collectible(state) {
  const runId = state.runId || null;
  const current = state.collectible || {};
  const identification = current.identification || null;

  // 1. HITL resume path: If you provide an override from the Edit Page
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

  // 2. Handle missing identification
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

  // 3. Already confirmed pass-through
  if (current.review?.status === 'confirmed') {
    logger.info('[LangGraph] confirm_collectible: Already confirmed; pass-through');
    return state;
  }

  // 4. MANDATORY HITL GATE: Always set to Pending for review
  const confidence = typeof identification.confidence === 'number' ? identification.confidence : null;
  const ticketId = current.review?.ticketId || runId;

  logger.info('[LangGraph] confirm_collectible: HITL gate enforced - requiring human review', {
    id: identification.id,
    confidence
  });

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
    // End-early pattern: send AI data to frontend so the user can see it to Approve or Edit
    finalResult: {
      caption: identification.category ? `${identification.category} (Review Needed)` : 'Collectible (Review Needed)',
      description: 'AI suggests this identification. Please approve or edit to continue to valuation.',
      keywords: 'collectible,review,pending',
      classification: state.classification || 'collectables',
      collectibleInsights: {
        identification: identification, // The "AI Guess" for the form
        visualMatches: state.visualMatches || null, // Google Lens results
        review: { 
          status: 'pending', 
          ticketId, 
          confidence 
        },
      },
    },
  };
}

module.exports = confirm_collectible;
