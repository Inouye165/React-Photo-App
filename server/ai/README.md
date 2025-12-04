# AI Service Documentation

This directory contains AI-powered features for the photo application, including point-of-interest (POI) detection, nutrition analysis, and LangGraph workflows.

## Point of Interest (POI) Detection

### Google Places Integration

The Google Places API integration (`poi/googlePlaces.js`) provides location-based POI discovery for photos with GPS metadata.

#### Architecture

**Parallel Type Requests**: The `nearbyPlaces` function executes parallel requests for multiple POI types to maximize result coverage. The Google Places API does not support multiple types in a single request, so we issue concurrent requests for:
- `park`
- `museum`
- `tourist_attraction`
- `natural_feature`

**Resilience**: Uses `Promise.allSettled` to ensure partial failures don't affect the entire batch. If one type request fails (network error, 500 status, etc.), results from successful requests are still returned.

**Deduplication**: Results are deduplicated by `place_id` using a Map for O(N) efficiency. The same POI often appears in multiple type category results (e.g., Central Park appears in both "park" and "tourist_attraction" searches).

**Caching**: Results are cached with a 24-hour TTL to reduce API costs and improve response times for repeated queries.

#### Configuration

Set the following environment variable:
```
GOOGLE_MAPS_API_KEY=your_api_key_here
```

The API key must have:
- Google Places API enabled
- Billing configured
- Server-side API restrictions

#### Error Handling

- **REQUEST_DENIED**: Triggers a 10-minute backoff to prevent quota exhaustion
- **Network Failures**: Logged but don't fail the entire request
- **Missing API Key**: Silently skips POI lookups (with one-time warning)

#### Testing

The test suite (`poi/googlePlaces.test.js`) validates:
- Name-based heuristics (trail detection)
- Deduplication logic
- Partial failure resilience
- Category normalization

Run tests: `npm test ai/poi/googlePlaces`

### OpenStreetMap Integration

Alternative POI source for trail data when Google Places doesn't return results. See `poi/osmTrails.js`.

## LangGraph Workflows

The `langgraph/` directory contains state machines for multi-step AI workflows, including GPS validation, POI inference, and caption generation.

## Food/Nutrition Analysis

The `food/` directory provides nutritional analysis capabilities using external APIs.

---

## Contributing

When modifying AI service code:
1. Update relevant tests
2. Run full test suite: `cd server && npm test`
3. Run linter: `cd server && npm run lint`
4. Update this README if architecture changes
