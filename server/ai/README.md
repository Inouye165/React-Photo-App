# AI Service Documentation

This directory contains AI-powered features for Lumina, including point-of-interest (POI) detection, nutrition analysis, and LangGraph workflows.

## Point of Interest (POI) Detection

### Places API Integration

The Places API integration (`server/ai/poi/googlePlaces.js`) provides location-based POI discovery for photos with GPS metadata.

#### Architecture

**Parallel Type Requests**: The `nearbyPlaces` function executes parallel requests for multiple POI types to maximize result coverage. The Places API does not support multiple types in a single request, so we issue concurrent requests for:
- `park`
- `museum`
- `tourist_attraction`
- `natural_feature`

**Resilience**: Uses `Promise.allSettled` to ensure partial failures don't affect the entire batch. If one type request fails (network error, 500 status, etc.), results from successful requests are still returned.

**Deduplication**: Results are deduplicated by `place_id` using a Map for O(N) efficiency. The same POI often appears in multiple type category results (e.g., Central Park appears in both "park" and "tourist_attraction" searches).

**Caching**: Results are cached with a 24-hour TTL to reduce API costs and improve response times for repeated queries.

#### Configuration

Set ONE of the following environment variables:
```
GOOGLE_MAPS_API_KEY=your_api_key_here
GOOGLE_PLACES_API_KEY=your_api_key_here
GOOGLE_API_KEY=your_api_key_here
```

The API key must have:
- Places API enabled
- Billing configured
- Server-side API restrictions

#### Error Handling

- **REQUEST_DENIED**: Triggers a 10-minute backoff to prevent quota exhaustion
- **Network Failures**: Logged but don't fail the entire request
- **Missing API Key**: Silently skips POI lookups (with one-time warning)

#### Testing

The test suite (`server/ai/poi/googlePlaces.test.js`) validates:
- Name-based heuristics (trail detection)
- Deduplication logic
- Partial failure resilience
- Category normalization

Run tests (from `server/`): `npm test -- ai/poi/googlePlaces.test.js`

### OpenStreetMap Integration

Alternative POI source for trail data when the Places provider doesn't return results. See `server/ai/poi/osmTrails.js`.

## LangGraph Workflows

The `langgraph/` directory contains state machines for multi-step AI workflows, including GPS validation, POI inference, caption generation, and collectible identification.

### Collectibles Pipeline

The collectibles pipeline identifies and values items in photos through a multi-stage process:

1. **Classification** → Detects if image contains a collectible item
2. **Identification** → AI identifies the specific item (e.g., "1952 Mickey Mantle Baseball Card")
3. **Confirmation (HITL Gate)** → **MANDATORY human review** - ALL identifications require approval
4. **Valuation** → Market research and price estimation (only after confirmation)
5. **Description** → Final metadata generation

#### Human-in-the-Loop (HITL) Enforcement

**CRITICAL**: The confirmation gate (`confirm_collectible.js`) enforces mandatory human review for ALL collectible identifications, regardless of AI confidence score.

- **No Auto-Confirmation**: Even 100% confidence identifications require user approval
- **Workflow Termination**: Pipeline stops at `END` after identification until user provides override
- **Resume Path**: User submits `collectibleOverride` with corrected/approved data to proceed
- **Edit Page Integration**: `finalResult.collectibleInsights.identification` contains AI suggestion for form pre-population

**Environment Variables** (deprecated for HITL enforcement):
- `COLLECTIBLES_REVIEW_THRESHOLD` - No longer used (all identifications require review)
- `COLLECTIBLES_FORCE_REVIEW` - No longer needed (review is always enforced)

**Security**: User overrides are sanitized via `safeTrimString()` before persisting to state/database.

## Food/Nutrition Analysis

The `food/` directory provides nutritional analysis capabilities using external APIs.

---

## Contributing

When modifying AI service code:
1. Update relevant tests
2. Run full test suite: `cd server && npm test`
3. Run linter: `cd server && npm run lint`
4. Update this README if architecture changes
