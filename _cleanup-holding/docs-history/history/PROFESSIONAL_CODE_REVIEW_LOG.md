> Historical note: This is a point-in-time log. Paths, scripts, or auth models may not match the current main branch.

# Professional Code Review Log: High-Priority Fixes

This document records high-impact issues identified in a professional code review, focusing on security, resilience, and operational cost efficiency.

## I. Security Gap: Missing Cross-Site Request Forgery (CSRF) Protection

### Problem
API endpoints that accept state-changing requests (`POST`, `PATCH`, `DELETE`) and rely solely on the `httpOnly` `authToken` cookie for authentication are vulnerable to **Cross-Site Request Forgery (CSRF)** attacks. An attacker can trick an authenticated user's browser into executing an unintended action.

### Strategy: Synchronizer Token Pattern (Double-Submit Cookie)
Implement a CSRF token mechanism to ensure all modifying requests originate from the application itself.

### Implementation TO DO
1.  **Token Generation:** Modify the login endpoint (`server/routes/auth.js`) to generate a unique, cryptographically secure CSRF token upon successful login.
2.  **Cookie and Header:** Set the CSRF token in an **non-httpOnly cookie** (to allow client JavaScript access) and include it in the login response body or a custom response header.
3.  **Client Implementation:** The React client must read this token and attach it to a custom HTTP header (e.g., `X-CSRF-Token`) for all mutating API calls.
4.  **Server Middleware:** Create a new middleware (e.g., `server/middleware/csrf.js`) to validate that the token in the request header matches the token in the request cookie on all protected routes.

---

## II. Resilience Risk: File State Race Conditions

### Problem
In the photo state transition logic (`PATCH /photos/:id/state` in `server/routes/photos.js`), the Supabase Storage file move and the Knex database update are sequential. A crash between these two steps, or a non-recoverable Supabase failure, risks **data inconsistency** (e.g., the file is moved, but the database still points to the old location).

### Strategy: Database-First / Two-Phase Update
Make the database the single source of truth for the photo's desired state.

### Implementation TO DO
1.  **DB Schema Update:** Add a column to the `photos` table, e.g., `state_transition_status` (enum: `IDLE`, `PENDING_MOVE`, `MOVE_FAILED`).
2.  **Route Logic Refactor (`server/routes/photos.js`):**
    a.  **Phase 1 (DB Lock):** Before calling Supabase `move`, update the database to the new state with `state_transition_status = PENDING_MOVE`.
    b.  **Phase 2 (Storage/DB Commit):** Only upon successful Supabase move (or successful fallback copy), set `state_transition_status = IDLE`.
    c.  If the move fails, set `state_transition_status = MOVE_FAILED`.
3.  **Background Repair Job:** Implement a maintenance script or worker job to periodically scan for records where `state_transition_status` is `PENDING_MOVE` or `MOVE_FAILED` and attempt automated repair or alert an administrator.

---

## III. Operational Cost & Stability Risk: AI Pipeline

### Problem
The AI service (`server/ai/service.js`) uses complex string parsing to extract results from the vision models, which is fragile against minor model output changes. Additionally, using `detail: 'high'` for all vision calls leads to unnecessarily high API costs, especially for simpler routing/classification steps.

### Strategy: Schema Enforcement and Conditional Cost Control
Introduce strict output validation to improve stability and optimize resource usage based on the vision task.

### Implementation TO DO (Stability)
1.  **Structured Output Validation:** Introduce a schema validation library (e.g., **Zod**) to define the exact expected JSON structure for AI responses (caption, description, keywords, etc.).
2.  **Parsing Refactor (`server/ai/service.js`):** Prioritize schema-based validation. If the LLM response fails validation:
    a.  Log the raw output.
    b.  Implement a simple text-only fallback.
    c.  Increment a new DB column, `ai_parsing_failure_count`, to track instability.
3.  **Model Configuration:** Ensure all prompt templates strongly instruct the model to use the specified JSON output format.

### Implementation TO DO (Cost Control)
1.  **Conditional Detail:** Modify `server/ai/service.js` to use **`detail: 'low'`** for the initial **`routerAgent`** call, as classification typically does not require high detail.
2.  Only use **`detail: 'high'`** for the final **`sceneryAgent`** or **`collectibleAgent`** after the router has determined the subject complexity, ensuring high cost is only incurred when genuinely needed.

---
