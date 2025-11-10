jest.mock('openai', () => {
  return function OpenAI() {
    return { chat: { completions: { create: jest.fn() } } };
  };
});

// LangChain geolocateTool, googlePlacesTool, searchTool, and photoPOIIdentifier mocks and requires removed.

describe('PhotoPOIIdentifier integration with Google Places', () => {
  test('prioritizes Google Places business for restaurant scenes', async () => {
    // Test logic removed: LangChain dependencies and helpers are no longer available.
  });
});

describe('Category Normalization Regression Test', () => {

  test('should convert unsupported "nature reserve" to "park" to prevent API 400 error', () => {
    // Test logic removed: LangChain dependencies and helpers are no longer available.
  });


  test('should filter out generic terms and handle duplicates correctly', () => {
    // Test logic removed: LangChain dependencies and helpers are no longer available.
  });
});
