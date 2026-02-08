/* eslint-env jest */

import { isAiEnabled, shouldRequireOpenAiKey } from '../utils/aiEnabled';

function buildEnv(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...values } as NodeJS.ProcessEnv;
}

describe('aiEnabled helper', () => {
  test('defaults to disabled in non-production', () => {
    const env = buildEnv({ NODE_ENV: 'development' });
    expect(isAiEnabled(env)).toBe(false);
  });

  test('defaults to enabled in production', () => {
    const env = buildEnv({ NODE_ENV: 'production' });
    expect(isAiEnabled(env)).toBe(true);
  });

  test('honors AI_ENABLED overrides', () => {
    expect(isAiEnabled(buildEnv({ NODE_ENV: 'production', AI_ENABLED: 'false' }))).toBe(false);
    expect(isAiEnabled(buildEnv({ NODE_ENV: 'development', AI_ENABLED: 'true' }))).toBe(true);
    expect(isAiEnabled(buildEnv({ NODE_ENV: 'development', AI_ENABLED: '1' }))).toBe(true);
    expect(isAiEnabled(buildEnv({ NODE_ENV: 'development', AI_ENABLED: 'off' }))).toBe(false);
  });

  test('honors ENABLE_AI alias when AI_ENABLED is unset', () => {
    expect(isAiEnabled(buildEnv({ NODE_ENV: 'development', ENABLE_AI: 'true' }))).toBe(true);
    expect(isAiEnabled(buildEnv({ NODE_ENV: 'production', ENABLE_AI: 'false' }))).toBe(false);
  });

  test('shouldRequireOpenAiKey is false in test env', () => {
    const env = buildEnv({ NODE_ENV: 'test', AI_ENABLED: 'true' });
    expect(shouldRequireOpenAiKey(env)).toBe(false);
  });
});
