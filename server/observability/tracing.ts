import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const IGNORED_PATHS = new Set(['/health', '/metrics', '/favicon.ico']);

type TracingHandle = { shutdown(): Promise<void> };

let initResult: TracingHandle | null = null;
let sdkInstance: NodeSDK | null = null;
let shutdownInProgress: Promise<void> | null = null;

function isEnabled(): boolean {
  const flag = (process.env.OTEL_ENABLED || '').toLowerCase();
  return flag === 'true' || flag === '1';
}

function isDebug(): boolean {
  const flag = (process.env.OTEL_DEBUG || '').toLowerCase();
  return flag === 'true' || flag === '1';
}

function shouldIgnorePath(url?: string): boolean {
  if (!url) return false;
  const path = url.split('?')[0];
  return IGNORED_PATHS.has(path);
}

function buildTraceExporter() {
  const endpoint = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '').trim();
  if (endpoint) {
    return new OTLPTraceExporter({ url: endpoint });
  }

  if (process.env.NODE_ENV !== 'production' && isDebug()) {
    return undefined;
  }

  return undefined;
}

export function initTracing({ serviceName }: { serviceName: string }): TracingHandle {
  if (initResult) return initResult;

  if (!isEnabled()) {
    initResult = { shutdown: async () => undefined };
    return initResult;
  }

  if (serviceName && !process.env.OTEL_SERVICE_NAME) {
    process.env.OTEL_SERVICE_NAME = serviceName;
  }

  const traceExporter = buildTraceExporter();

  sdkInstance = new NodeSDK({
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => shouldIgnorePath(req?.url),
        },
      }),
    ],
  });

  shutdownInProgress = null;
  Promise.resolve(sdkInstance.start()).catch(() => undefined);

  initResult = {
    shutdown: async () => {
      if (!sdkInstance) return;
      if (!shutdownInProgress) {
        const instance = sdkInstance;
        sdkInstance = null;
        shutdownInProgress = instance.shutdown().catch(() => undefined) as Promise<void>;
      }
      await shutdownInProgress;
    },
  };

  return initResult;
}
