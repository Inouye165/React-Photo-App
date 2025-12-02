# Update AI → LangGraph Pipeline Trace

Legend:

| Icon | Meaning |
| --- | --- |
| 🟦 | Client UI / React front end |
| 🟧 | HTTP API hop (fetch/Express) |
| 🟩 | Queue & worker infrastructure |
| 🟥 | LangGraph / LLM inference step |
| 🟨 | Database or storage mutation |
| ⬛ | Observability & log/artifact generation |

## Timeline from Click to Visible Data

| # | Stage | What Happens | Files & Functions |
| - | ----- | ------------ | ----------------- |
| 1 | 🟦 | User presses the **Update AI** (labeled **Recheck AI** in UI) button on the edit drawer, which toggles the `recheckingAI` flag and invokes the injected `onRecheckAI`. | `src/EditPage.jsx` – inline button handler calling `onRecheckAI(photo.id)` |
| 2 | 🟦 | Route component wires that callback: `PhotoEditPage.handleRecheckAI` checks that Docker/AI dependencies are ready, surfaces banners, and imports the API helper dynamically. | `src/pages/PhotoEditPage.jsx` – `handleRecheckAI` |
| 3 | 🟦🟧 | The client helper `recheckPhotoAI(photoId, model)` builds `POST /photos/:id/run-ai`, attaches credentials, and fires it through the `apiLimiter`. Success dispatches a `photo:run-ai` event/localStorage ping so other tabs know polling should start. | `src/api.js` – `recheckPhotoAI` |
| 4 | 🟧 | Express receives the request, re-loads the photo row for the authenticated user, validates optional model overrides, and delegates to the AI service. | `server/routes/photos.js` – route handler for `router.post('/:id/run-ai', ...)` |
| 5 | 🟩 | The AI service wrapper simply forwards to the queue abstraction so all enqueue logic stays centralized. | `server/services/photosAi.js` – `enqueuePhotoAiJob` |
| 6 | 🟩 | BullMQ queue initialization ensures Redis is reachable, then `addAIJob` pushes a `process-photo-ai` job whose payload includes the `photoId` and any override metadata. Worker startup (`startWorker` from `server/worker.js`) binds the processor. | `server/queue/index.js` – `initializeQueue`, `addAIJob`, `startWorker` |
| 7 | 🟩🟨 | Worker processor fetches the photo row via Knex, derives the storage path, optionally replays metadata extraction/thumbnailing, then calls `updatePhotoAIMetadata`. | `server/queue/index.js` – inline `processor` inside `startWorker` |
| 8 | 🟨 | `updatePhotoAIMetadata` signs a Supabase download URL, streams/converts HEIC→JPEG with Sharp, parses EXIF via `exifr`, builds GPS/device hints, guards against retry storms, and eventually calls `processPhotoAI`. | `server/ai/service.js` – `updatePhotoAIMetadata` |
| 9 | 🟥 | `processPhotoAI` normalizes metadata, builds a LangGraph state (`runId`, buffers, GPS, overrides), logs the sanitized initial snapshot, and invokes the compiled LangGraph app. | `server/ai/service.js` – `processPhotoAI`; `server/ai/langgraph/graph.js` – `app.invoke` |
| 10 | 🟥 | **Branch Point A – `collect_context` router.** After `classify_image` and POI priming, `route_after_context` inspects `state.classification`. `collectables` jump straight to `identify_collectible`, everything else runs `location_intelligence_agent`. A mis-routed classification here would skip entire pipelines. | `server/ai/langgraph/graph.js` – `route_after_context`; `server/ai/langgraph/nodes/collect_context.js`, `identify_collectible.js` |
| 11 | 🟥 | **Branch Point B – `location_intelligence_agent` router.** Once geography is enriched, `route_after_location` fans out: `collectables` → `handle_collectible`, `food` → `food_location_agent` (and later `food_metadata_agent`), scenery with POI needs → `decide_scene_label`, default → `generate_metadata`. Every branch rejoins at either `describe_collectible`, `food_metadata_agent`, or `generate_metadata`, each of which writes `finalResult`. | `server/ai/langgraph/graph.js` – `route_after_location`; node files in `server/ai/langgraph/nodes/` |
| 12 | 🟥 | **Branch workloads.** Collectibles: `identify_collectible` → `valuate_collectible` → `describe_collectible`. Scenery: `location_intelligence_agent` → (`decide_scene_label` if GPS-rich) → `generate_metadata`. Food: `food_location_agent` → `food_metadata_agent`. Every path logs via `auditLogger` and returns a populated `finalResult`. | `server/ai/langgraph/nodes/*` |
| 13 | ⬛ | Every node start/finish, tool call, and LLM request funnels through `server/ai/langgraph/audit_logger.js`, which appends Markdown to `langgraph_execution.md`. The `collectibles-execution-log.md` inside `docs/pipeline-graphs/` is a curated copy of that raw log for the collectibles run you opened. | `server/ai/langgraph/audit_logger.js` – `logGraphStart/End`, `logNodeStart/End`, `logLLMUsage`; resulting artifact `docs/pipeline-graphs/collectibles-execution-log.md` |
| 14 | 🟨 | Once LangGraph returns, the AI result is validated (`AnalysisResultSchema`), keywords are merged with EXIF hints, and a DB transaction updates `photos` plus upserts `collectibles` and `collectible_market_data` rows (persisting `collectibleInsights`, history, specifics, valuations). | `server/ai/schemas.js`; `server/ai/service.js` – transactional block inside `updatePhotoAIMetadata` |
| 15 | 🟦 | While the job runs, `useAIPolling` notices the `pollingPhotoId` and polls `GET /photos/:id` with cache-busting every 3s. Once caption/description/keywords or `updated_at` change, it updates Zustand state and clears the polling flags. | `src/hooks/useAIPolling.jsx` – effect + `hasNewAIdata`; `src/api.js` – `getPhoto` |
| 16 | 🟦 | The updated photo in state re-renders the edit drawer. `CollectibleDetailView` and `CollectibleEditorPanel` receive the refreshed `photo.poi_analysis` / `collectibleData`, so the valuation, specifics, and price sources appear without another click. | `src/components/CollectibleDetailView.jsx`; `src/components/CollectibleEditorPanel.jsx`; `src/EditPage.jsx` |

## How the Execution Logs Are Produced

1. `processPhotoAI` assigns a `runId` and immediately calls `auditLogger.logGraphStart`, writing the sanitized initial state to `langgraph_execution.md` (project root).
2. Each wrapped node (`wrapNode` in `server/ai/langgraph/graph.js`) emits `logNodeStart` before running and `logNodeEnd` afterward. LLM-using nodes additionally call `auditLogger.logLLMUsage` so prompts/responses land in the log.
3. Tool executions inside `handle_collectible` (e.g., `google_collectible_search`) emit `logToolCall` entries through the same logger.
4. When the graph finishes, `logGraphEnd` appends the final state. The resulting Markdown is what you see in category-specific snapshots (e.g., `docs/pipeline-graphs/collectibles-execution-log.md`)—each is a preserved run so the flow can be studied offline or converted to a Mermaid diagram.

## Branch Decision Surfaces (Engineer Watchpoints)

| Router | Inputs Observed | Branches | Merge Point | Failure Surfaces |
| --- | --- | --- | --- | --- |
| **A. route_after_context** | `state.classification` coming from `classify_image` | `collectables` → `identify_collectible`; everything else → `location_intelligence_agent`; `state.error` → `END` | Collectibles branch later rejoins when `describe_collectible` emits `finalResult`; other branches merge once `generate_metadata` or `food_metadata_agent` runs | Misclassification strands collectibles in scenery path (missing valuation) or vice versa; null classification drops into location intel, so watch logs for `[LangGraph] Router: Fast-tracking collectible` |
| **B. route_after_location** | Classification, `needPoi(state)` flag, `state.error` | `handle_collectible`, `food_location_agent`, `decide_scene_label`, or fall-through `generate_metadata` | All flows return to `finalResult` writer nodes (`describe_collectible`, `food_metadata_agent`, `generate_metadata`) | If GPS missing, scenery may skip POI enrichment; collectibles mis-tagged here will never hit `handle_collectible`; ensure `needPoi` logic only trips when POI data exists |

## Branch Playbooks (High-Level Steps)

### Collectibles Path
1. `classify_image` tags photo as `collectables` (threshold: JSON `{ "classification": "collectables" }`).
2. Router A short-circuits `location_intelligence_agent`, jumping into `identify_collectible` (vision ID heuristics) and `valuate_collectible` (LLM + `google_collectible_search`).
3. `handle_collectible` runs the ReAct tool loop, enforcing `CollectibleOutputSchema` and grabbing market data before `describe_collectible` crafts caption/description/keywords.
4. DB commit writes `photos.caption|description|keywords`, persists `collectibleInsights`, and upserts `collectibles` + `collectible_market_data` rows.
5. UI polling surfaces fresh appraisal fields in `CollectibleDetailView`.

### Scenery / General Path
1. Classification anything but `collectables`/`food` → Router A sends to `location_intelligence_agent` for reverse geocode + POI.
2. Router B checks `needPoi(state)`; GPS-heavy shots go through `decide_scene_label` (LLM naming) before `generate_metadata`; others jump straight to `generate_metadata`.
3. `generate_metadata` returns `finalResult` (caption/description/keywords + optional `poiAnalysis`), after which the DB write simply updates the `photos` row.
4. No collectibles tables touched; UI refresh just updates the story tab.

### Food Path
1. Classification contains `food` → Router A still performs `location_intelligence_agent` for general context, but Router B diverts into `food_location_agent`.
2. `food_location_agent` curates restaurant candidates, possibly forcing deterministic picks when distance + rating thresholds pass.
3. `food_metadata_agent` merges culinary context with general metadata before returning `finalResult`.
4. DB write mirrors scenery path (no collectibles table), but `poi_analysis.food` carries restaurant reasoning that UI can show.

> **Investigation tip:** Because every branch ultimately depends on the first classifier output, any systematic bug there cascades. When debugging odd outputs, cross-check `collectibles-execution-log.md` (or the raw `langgraph_execution.md`) to confirm the routers announced the expected branch.

## Missing Metadata Diagnostics (Focus on Scenery)

1. **Classifier drift** – If `classify_image` never labels scenery shots as `scenery`, Router B may skip `decide_scene_label`, leaving `generate_metadata` without POI context. Inspect `langgraph_execution.md` for the raw classification and consider confidence thresholds.
2. **GPS gaps** – `collect_context` and `location_intelligence_agent` require a parsed lat/lon. Missing EXIF or conversion failures result in `poiCache: null`, so downstream nodes cannot enrich descriptions. Watch for `[LangGraph] collect_context: No GPS available, skipping`.
3. **`needPoi(state)` guard** – Even with GPS, if `poiAnalysis?.gpsString` is unset, Router B bypasses `decide_scene_label`. Confirm `needPoi` inputs when triaging missing scenic metadata; a bug in `location_intelligence_agent` that fails to set `poiAnalysis` manifests here.
4. **LLM response parsing** – `generate_metadata` expects valid JSON. Schema failures bubble up as `state.error`, causing the graph to short-circuit before writing `finalResult`. Look for validation errors in server logs and consider expanding audit slices for the failing run.
5. **DB transaction rollback** – Even when LangGraph succeeds, the transactional write in `updatePhotoAIMetadata` can fail (e.g., constraint violations), leaving the photo with stale metadata. Check server logs for `[AI Debug] Writing AI metadata to DB` immediately followed by an exception.

## File & Function Reference

- `src/EditPage.jsx` – button handler invoking `onRecheckAI`.
- `src/pages/PhotoEditPage.jsx` – `handleRecheckAI` wiring to API helper and banners.
- `src/api.js` – `recheckPhotoAI`, `getPhoto`, auth header helpers.
- `server/routes/photos.js` – `/photos/:id/run-ai` handler.
- `server/services/photosAi.js` – `enqueuePhotoAiJob` wrapper.
- `server/queue/index.js` – `initializeQueue`, `addAIJob`, `startWorker`, BullMQ processor.
- `server/worker.js` – starts the dedicated worker process.
- `server/ai/service.js` – `updatePhotoAIMetadata`, `processPhotoAI`, DB transaction + collectible upsert.
- `server/ai/langgraph/graph.js` – node wiring, routing, `wrapNode` instrumentation.
- `server/ai/langgraph/nodes/*.js` – implementations for `classify_image`, `collect_context`, `location_intelligence_agent`, `handle_collectible`, `describe_collectible`, etc.
- `server/ai/langgraph/audit_logger.js` – Markdown log writer that produces the execution log.
- `src/hooks/useAIPolling.jsx` – polling loop that detects the fresh AI run.
- `src/components/CollectibleDetailView.jsx` & `CollectibleEditorPanel.jsx` – render the final AI-fed data.

With these pieces combined you can trace any future run: the UI event queues work, workers call LangGraph, DB writes land, polling propagates, and the Markdown execution log documents every node contributing to the collectibles analysis.
