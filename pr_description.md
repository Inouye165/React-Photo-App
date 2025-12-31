## 🚀 Description
Adds an admin-only “App Assessments” workflow, including support for manually pasting external LLM reviews (e.g. ChatGPT/Gemini) and storing provider/model/prompt/response so grades can be compared over time.

## 🛠️ Changes
### 🔐 Admin API
- Add single-record fetch endpoint: `GET /api/admin/assessments/:id`.
- Add external/manual create endpoint: `POST /api/admin/assessments/external`.

### 🧠 External assessment storage
- Persist provider, model, optional prompt, and full response text into existing JSONB fields (no new migration).
- Preserve existing confirm/recompute semantics (server remains the source of truth for confirmed grade).

### 🧾 Admin UI
- Make the feature discoverable from Admin Dashboard.
- Add “Add External Assessment” form on assessment history.
- Improve detail view reliability by fetching by id instead of relying on list pagination.

## 📁 Files Touched
- Backend: `server/routes/admin.js`, `server/services/assessmentsDb.js`
- Frontend: `src/pages/AdminDashboard.tsx`, `src/pages/AdminAssessmentHistory.tsx`, `src/pages/AssessmentReviewDetail.tsx`

## ✅ Verification
Ran locally (Windows):
- Frontend tests: `npm test`
- Server tests: `npm --prefix server test`

## 🔒 Scope
- No dependency changes.
- No schema changes for provider/model/prompt/response (stored in existing JSONB columns).