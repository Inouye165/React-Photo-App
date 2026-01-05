const confirm_collectible = require('../ai/langgraph/nodes/confirm_collectible');

describe('confirm_collectible', () => {
  beforeEach(() => {
    // Set test environment variables
    process.env.COLLECTIBLES_REVIEW_THRESHOLD = '0.75';
    process.env.COLLECTIBLES_FORCE_REVIEW = 'false';
  });

  afterEach(() => {
    delete process.env.COLLECTIBLES_REVIEW_THRESHOLD;
    delete process.env.COLLECTIBLES_FORCE_REVIEW;
  });

  test('includes identification in finalResult when status is pending', async () => {
    const state = {
      runId: 'test-run-123',
      collectible: {
        identification: {
          id: 'Marvel Comics #1',
          category: 'Comic Book',
          confidence: 0.6, // Below threshold
          fields: { publisher: 'Marvel', year: 1939 },
          source: 'ai',
        },
      },
      visualMatches: [
        { title: 'Marvel Comics #1 - Heritage Auctions', link: 'https://example.com/marvel1' },
        { title: 'Marvel Comics #1 CGC 9.0', link: 'https://example.com/marvel2' },
      ],
    };

    const result = await confirm_collectible(state);

    expect(result.collectible.review.status).toBe('pending');
    expect(result.finalResult).toBeDefined();
    expect(result.finalResult.description).toBe('AI suggests this identification. Please approve or edit to continue to valuation.');
    expect(result.finalResult.collectibleInsights.identification).toBeDefined();
    expect(result.finalResult.collectibleInsights.identification.id).toBe('Marvel Comics #1');
    expect(result.finalResult.collectibleInsights.identification.category).toBe('Comic Book');
    expect(result.finalResult.collectibleInsights.identification.confidence).toBe(0.6);
    expect(result.finalResult.collectibleInsights.visualMatches).toBeDefined();
    expect(result.finalResult.collectibleInsights.visualMatches).toHaveLength(2);
    expect(result.finalResult.collectibleInsights.review.status).toBe('pending');
  });

  test('auto-confirms when confidence >= threshold', async () => {
    const state = {
      runId: 'test-run-456',
      collectible: {
        identification: {
          id: 'Action Comics #1',
          category: 'Comic Book',
          confidence: 0.95, // Above threshold
          fields: null,
          source: 'ai',
        },
      },
    };

    const result = await confirm_collectible(state);

    expect(result.collectible.review.status).toBe('confirmed');
    expect(result.collectible.review.confirmedBy).toBe('system');
    expect(result.finalResult).toBeUndefined();
  });

  test('forces review when COLLECTIBLES_FORCE_REVIEW is true', async () => {
    process.env.COLLECTIBLES_FORCE_REVIEW = 'true';

    const state = {
      runId: 'test-run-789',
      collectible: {
        identification: {
          id: 'High Confidence Item',
          category: 'Toys',
          confidence: 0.99, // Very high confidence
          fields: null,
          source: 'ai',
        },
      },
    };

    const result = await confirm_collectible(state);

    expect(result.collectible.review.status).toBe('pending');
    expect(result.finalResult).toBeDefined();
    expect(result.finalResult.collectibleInsights.identification).toBeDefined();
  });

  test('applies human override with sanitized fields', async () => {
    const state = {
      runId: 'test-run-override',
      collectible: {
        identification: {
          id: 'Wrong ID',
          category: 'Comic Book',
          confidence: 0.8,
          fields: null,
          source: 'ai',
        },
      },
      collectibleOverride: {
        id: '  Corrected Comic #1  ', // With whitespace
        category: 'Comic Book',
        fields: { publisher: 'Marvel' },
        confirmedBy: '  user-123  ', // With whitespace
      },
    };

    const result = await confirm_collectible(state);

    expect(result.collectible.identification.id).toBe('Corrected Comic #1');
    expect(result.collectible.identification.source).toBe('human');
    expect(result.collectible.identification.confidence).toBe(1);
    expect(result.collectible.review.status).toBe('confirmed');
    expect(result.collectible.review.confirmedBy).toBe('user-123');
    expect(result.collectible.review.editHistory).toHaveLength(1);
    expect(result.collectible.review.editHistory[0].type).toBe('identification_override');
  });

  test('rejects when identification is missing', async () => {
    const state = {
      runId: 'test-run-missing',
      collectible: {
        // No identification
      },
    };

    const result = await confirm_collectible(state);

    expect(result.collectible.review.status).toBe('rejected');
    expect(result.finalResult).toBeDefined();
    expect(result.finalResult.description).toBe('Collectible identification failed and requires human review.');
  });

  test('sanitizes collectibleOverride with null/invalid id', async () => {
    const state = {
      runId: 'test-run-invalid',
      collectible: {
        identification: {
          id: 'Original ID',
          category: 'Toys',
          confidence: 0.7,
          fields: null,
          source: 'ai',
        },
      },
      collectibleOverride: {
        id: '   ', // Only whitespace
        category: 'Toys',
      },
    };

    const result = await confirm_collectible(state);

    // Should not apply override if id is invalid
    expect(result.collectible.review.status).toBe('pending');
    expect(result.finalResult).toBeDefined();
  });

  test('includes visualMatches when available', async () => {
    const state = {
      runId: 'test-run-visual',
      collectible: {
        identification: {
          id: 'Pyrex Bowl',
          category: 'Kitchenware',
          confidence: 0.65,
          fields: null,
          source: 'ai',
        },
      },
      visualMatches: [
        { title: 'Pyrex Butterprint Bowl', link: 'https://example.com/pyrex1' },
      ],
    };

    const result = await confirm_collectible(state);

    expect(result.finalResult.collectibleInsights.visualMatches).toBeDefined();
    expect(result.finalResult.collectibleInsights.visualMatches).toHaveLength(1);
  });

  test('handles missing visualMatches gracefully', async () => {
    const state = {
      runId: 'test-run-no-visual',
      collectible: {
        identification: {
          id: 'Generic Item',
          category: 'Other',
          confidence: 0.5,
          fields: null,
          source: 'ai',
        },
      },
      // No visualMatches
    };

    const result = await confirm_collectible(state);

    expect(result.finalResult.collectibleInsights.visualMatches).toBeNull();
  });
});
