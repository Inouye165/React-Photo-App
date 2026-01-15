const mockSdkState = {
  startMock: jest.fn().mockResolvedValue(undefined),
  shutdownMock: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@opentelemetry/sdk-node', () => {
  return {
    NodeSDK: jest.fn().mockImplementation(() => ({
      start: mockSdkState.startMock,
      shutdown: mockSdkState.shutdownMock,
    })),
  };
});

jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: jest.fn(() => ({})),
}));

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: jest.fn().mockImplementation(() => ({})),
}));

describe('observability tracing init', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OTEL_ENABLED;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_SERVICE_NAME;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('initTracing is a noop when OTEL_ENABLED is false', async () => {
    const { initTracing } = require('../observability/tracing');
    const handle = initTracing({ serviceName: 'test-service' });

    expect(handle).toEqual(expect.objectContaining({ shutdown: expect.any(Function) }));
    expect(require('@opentelemetry/sdk-node').NodeSDK).not.toHaveBeenCalled();

    await handle.shutdown();
    expect(mockSdkState.shutdownMock).not.toHaveBeenCalled();
  });

  test('initTracing starts once and shuts down once when enabled', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318/v1/traces';

    const { initTracing } = require('../observability/tracing');
    const handleA = initTracing({ serviceName: 'test-service' });
    const handleB = initTracing({ serviceName: 'test-service' });

    expect(require('@opentelemetry/sdk-node').NodeSDK).toHaveBeenCalledTimes(1);
    expect(handleA).toBe(handleB);

    await handleA.shutdown();
    await handleB.shutdown();

    expect(mockSdkState.shutdownMock).toHaveBeenCalledTimes(1);
  });
});
