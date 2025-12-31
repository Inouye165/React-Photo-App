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

function normalizeAssessmentsDbError(err) {
  const code = err?.code || err?.original?.code || err?.cause?.code;
  const message = typeof err?.message === 'string' ? err.message : '';

  // Postgres: 42P01 = undefined_table, 42703 = undefined_column
  // These generally indicate migrations haven't been applied in the target environment.
  const isMissingTable = code === '42P01' || /relation\s+"app_assessments"\s+does\s+not\s+exist/i.test(message);
  const isMissingColumn = code === '42703' || /column\s+"[^"]+"\s+of\s+relation\s+"app_assessments"\s+does\s+not\s+exist/i.test(message);

  if (isMissingTable || isMissingColumn) {
    const e = new Error(
      'Assessments storage is not initialized in this environment. Run server database migrations to create/update the app_assessments table.',
    );
    e.statusCode = 503;
    e.code = isMissingTable ? 'ASSESSMENTS_TABLE_MISSING' : 'ASSESSMENTS_SCHEMA_OUT_OF_DATE';
    e.details = { dbCode: code || null };
    return e;
  }

  return err;
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

      try {
        const rows = await db('app_assessments').insert(insertRow).returning('*');
        return rows?.[0];
      } catch (err) {
        throw normalizeAssessmentsDbError(err);
      }
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

      try {
        const rows = await db('app_assessments').insert(insertRow).returning('*');
        return rows?.[0];
      } catch (err) {
        throw normalizeAssessmentsDbError(err);
      }
    },

    async listAssessments({ limit = 50, offset = 0, status } = {}) {
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
      const safeOffset = Math.max(0, Number(offset) || 0);
      const safeStatus = status ? sanitizeStatus(status) : null;

      try {
        const q = db('app_assessments')
          .select('*')
          .orderBy('created_at', 'desc')
          .limit(safeLimit)
          .offset(safeOffset);

        if (safeStatus) q.where({ status: safeStatus });

        const rows = await q;
        return rows;
      } catch (err) {
        throw normalizeAssessmentsDbError(err);
      }
    },

    async getAssessmentById(id) {
      try {
        const row = await db('app_assessments').where({ id }).first();
        return row;
      } catch (err) {
        throw normalizeAssessmentsDbError(err);
      }
    },

    async setAssessmentResult({ id, raw_ai_response, trace_log, status }) {
      const safeStatus = status ? sanitizeStatus(status) : null;

      const patch = {
        raw_ai_response: raw_ai_response ?? null,
        trace_log: trace_log ?? null,
        updated_at: db.fn.now(),
      };

      if (safeStatus) patch.status = safeStatus;

      try {
        const rows = await db('app_assessments').where({ id }).update(patch).returning('*');
        return rows?.[0];
      } catch (err) {
        throw normalizeAssessmentsDbError(err);
      }
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

      let existing;
      try {
        existing = await db('app_assessments').where({ id }).first();
      } catch (err) {
        throw normalizeAssessmentsDbError(err);
      }
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

      try {
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
      } catch (err) {
        throw normalizeAssessmentsDbError(err);
      }
    },
  };
};
