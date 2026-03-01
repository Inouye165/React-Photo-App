// @ts-nocheck

function sanitizeStatus(status) {
  if (status === 'pending_review' || status === 'confirmed' || status === 'rejected') return status;
  return null;
}

function sanitizeDecision(decision) {
  if (decision === 'confirmed' || decision === 'rejected') return decision;
  return null;
}

function computeFinalGradeFromRaw(rawAiResponse) {
  // Expect shape similar to: { scores: { security, correctness, ... }, final_grade? }
  if (!rawAiResponse || typeof rawAiResponse !== 'object') return null;

  const direct = rawAiResponse.final_grade;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;

  const scores = rawAiResponse.scores;
  if (!scores || typeof scores !== 'object') return null;

  // Balanced Rubric weights (can be adjusted later; keep stable here).
  const weights = {
    security: 0.35,
    correctness: 0.25,
    reliability: 0.15,
    maintainability: 0.15,
    performance: 0.1,
  };

  let sum = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const v = scores[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      sum += v * weight;
      weightSum += weight;
    }
  }

  if (weightSum <= 0) return null;
  const grade = sum / weightSum;
  return Number.isFinite(grade) ? grade : null;
}

module.exports = function createAssessmentsDb({ db }) {
  return {
    computeFinalGradeFromRaw,

    async createExternalAssessment({ commit_hash, llm_provider, llm_model, prompt, responseText, final_grade }) {
      const provider = typeof llm_provider === 'string' ? llm_provider.trim() : '';
      const model = typeof llm_model === 'string' ? llm_model.trim() : '';
      const promptText = typeof prompt === 'string' ? prompt : '';
      const respText = typeof responseText === 'string' ? responseText : '';

      const suggestedGrade = typeof final_grade === 'number' && Number.isFinite(final_grade) ? final_grade : null;

      if (!provider) {
        const err = new Error('llm_provider is required');
        err.statusCode = 400;
        throw err;
      }
      if (!model) {
        const err = new Error('llm_model is required');
        err.statusCode = 400;
        throw err;
      }
      if (!respText) {
        const err = new Error('responseText is required');
        err.statusCode = 400;
        throw err;
      }

      const insertRow = {
        status: 'pending_review',
        commit_hash: commit_hash || null,
        raw_ai_response: {
          provider,
          model,
          responseText: respText,
          final_grade: suggestedGrade,
        },
        trace_log: {
          source: 'external',
          provider,
          model,
          prompt: promptText,
          captured_at: new Date().toISOString(),
        },
        final_grade: null,
        reviewer_id: null,
        notes: null,
        updated_at: db.fn.now(),
      };

      const rows = await db('app_assessments').insert(insertRow).returning('*');
      return rows?.[0];
    },

    async createAssessment({ commit_hash }) {
      const insertRow = {
        status: 'pending_review',
        commit_hash: commit_hash || null,
        raw_ai_response: null,
        trace_log: null,
        final_grade: null,
        reviewer_id: null,
        notes: null,
        updated_at: db.fn.now(),
      };

      const rows = await db('app_assessments').insert(insertRow).returning('*');
      return rows?.[0];
    },

    async listAssessments({ limit = 50, offset = 0, status } = {}) {
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
      const safeOffset = Math.max(0, Number(offset) || 0);
      const safeStatus = status ? sanitizeStatus(status) : null;

      const q = db('app_assessments')
        .select('*')
        .orderBy('created_at', 'desc')
        .limit(safeLimit)
        .offset(safeOffset);

      if (safeStatus) q.where({ status: safeStatus });

      return q;
    },

    async getAssessmentById(id) {
      return db('app_assessments').where({ id }).first();
    },

    async setAssessmentResult({ id, raw_ai_response, trace_log, status }) {
      const safeStatus = status ? sanitizeStatus(status) : null;

      const patch = {
        raw_ai_response: raw_ai_response ?? null,
        trace_log: trace_log ?? null,
        updated_at: db.fn.now(),
      };

      if (safeStatus) patch.status = safeStatus;

      const rows = await db('app_assessments').where({ id }).update(patch).returning('*');
      return rows?.[0];
    },

    async confirmAssessment({ id, reviewer_id, notes, decision }) {
      const safeDecision = sanitizeDecision(decision);
      if (!safeDecision) {
        const err = new Error('Invalid decision');
        err.statusCode = 400;
        throw err;
      }
      if (!reviewer_id) {
        const err = new Error('reviewer_id is required');
        err.statusCode = 400;
        throw err;
      }

      const existing = await db('app_assessments').where({ id }).first();
      if (!existing) {
        const err = new Error('Assessment not found');
        err.statusCode = 404;
        throw err;
      }
      if (existing.status !== 'pending_review') {
        const err = new Error('Assessment is not pending_review');
        err.statusCode = 409;
        throw err;
      }

      const final_grade = computeFinalGradeFromRaw(existing.raw_ai_response);

      const rows = await db('app_assessments')
        .where({ id })
        .update({
          status: safeDecision,
          reviewer_id,
          notes: notes ?? null,
          final_grade,
          updated_at: db.fn.now(),
        })
        .returning('*');

      return rows?.[0];
    },
  };
};
