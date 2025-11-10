describe('LangSmith configuration', () => {
  test('LANGCHAIN tracing environment variables remain configured', () => {
    const env = require('../env');

    expect(env.LANGCHAIN_TRACING_V2).toBe('true');
    expect(typeof env.LANGCHAIN_API_KEY).toBe('string');
    expect(env.LANGCHAIN_API_KEY?.length).toBeGreaterThanOrEqual(20);
    expect(env.LANGCHAIN_PROJECT).toBe('photo-app');
  });
});
