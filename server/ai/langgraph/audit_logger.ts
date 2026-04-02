// server/ai/langgraph/audit_logger.ts
// Structured audit logger for the LangGraph AI pipeline.
// Emits to stdout only; writing user-controlled content to files is intentionally avoided.

const AUDIT_LOGGER_ENABLED: boolean =
  process.env.AI_AUDIT_LOGGER_ENABLED === 'true' && process.env.NODE_ENV !== 'production';

if (AUDIT_LOGGER_ENABLED) {
  console.log('[AuditLogger] Enabled (stdout)');
}

const SKIP_KEYS = new Set([
  'fileBuffer', 'imageBase64', 'url',
  'ProfileCMMType', 'ProfileVersion', 'ProfileClass', 'ColorSpaceData',
  'ProfileConnectionSpace', 'ProfileDateTime', 'ProfileFileSignature',
  'PrimaryPlatform', 'DeviceManufacturer', 'RenderingIntent',
  'ProfileCreator', 'ProfileDescription', 'ProfileCopyright',
  'MediaWhitePoint', 'RedMatrixColumn', 'GreenMatrixColumn', 'BlueMatrixColumn',
  'RedTRC', 'GreenTRC', 'BlueTRC', 'ChromaticAdaptation',
  'Regions', 'RegionList', 'AppliedToDimensions', 'CreatorTool',
]);

const SEPARATOR = '\n' + '='.repeat(80) + '\n';

function appendLog(content: string): void {
  if (!AUDIT_LOGGER_ENABLED) return;
  try {
    console.log(content);
  } catch (err) {
    console.error('[AuditLogger] Failed to write to audit log:', err);
  }
}

function formatTimestamp(): string {
  const now = new Date();
  return `${now.toISOString()} (Local: ${now.toLocaleString()})`;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[Max Depth Reached]';
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';

  if (Buffer.isBuffer(value)) {
    return `[Buffer: ${value.length} bytes]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    if (value.length > 500) {
      return value.substring(0, 500) + `... [truncated ${value.length - 500} chars]`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > 10) {
      const sanitized: unknown[] = value.slice(0, 10).map((item) => sanitizeValue(item, depth + 1));
      sanitized.push(`... [truncated ${value.length - 10} items]`);
      return sanitized;
    }
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};

    for (const key of Object.keys(obj)) {
      if (SKIP_KEYS.has(key)) {
        sanitized[key] = '[Omitted for brevity]';
      } else if (key === 'metadata' && depth === 0) {
        const meta = obj[key] as Record<string, unknown> | null | undefined;
        if (meta && typeof meta === 'object') {
          sanitized[key] = {
            date: meta.CreateDate ?? meta.DateTimeOriginal ?? meta.ModifyDate ?? '[Omitted]',
            GPSLatitude: meta.GPSLatitude ?? meta.latitude,
            GPSLongitude: meta.GPSLongitude ?? meta.longitude,
            GPSAltitude: meta.GPSAltitude,
            GPSImgDirection: meta.GPSImgDirection,
            GPSDestBearing: meta.GPSDestBearing,
            gps: meta.gps,
            GPS: meta.GPS,
            camera: meta.Make ?? meta.Model ?? '[Omitted]',
            '...': '[Other metadata omitted for brevity]',
          };
        } else {
          sanitized[key] = meta;
        }
      } else if (key === 'collectible_valuation' && obj[key]) {
        const valuation = obj[key] as Record<string, unknown>;
        sanitized[key] = {
          currency: valuation.currency,
          low: valuation.low,
          high: valuation.high,
          marketDataPoints: Array.isArray(valuation.market_data) ? valuation.market_data.length : 0,
        };
      } else if (key === 'collectible' && obj[key]) {
        const collectible = (obj[key] ?? {}) as Record<string, Record<string, unknown> | null | undefined>;
        const identification = collectible.identification;
        const review = collectible.review;
        const valuation = collectible.valuation;
        sanitized[key] = {
          identification: identification
            ? {
                id: identification.id,
                category: identification.category,
                confidence: identification.confidence,
                source: identification.source,
              }
            : null,
          review: review
            ? {
                status: review.status,
                ticketId: review.ticketId,
                confirmedBy: review.confirmedBy,
                confirmedAt: review.confirmedAt,
                version: review.version,
                expiresAt: review.expiresAt,
                editHistoryCount: Array.isArray(review.editHistory) ? review.editHistory.length : 0,
              }
            : null,
          valuationSummary: valuation
            ? {
                currency: valuation.currency,
                low: valuation.low,
                high: valuation.high,
                marketDataPoints: Array.isArray(valuation.market_data) ? valuation.market_data.length : 0,
              }
            : null,
        };
      } else if (key === 'poiCache' && depth > 0) {
        sanitized[key] = '[Omitted for brevity]';
      } else {
        sanitized[key] = sanitizeValue(obj[key], depth + 1);
      }
    }

    return sanitized;
  }

  return value;
}

function formatValue(value: unknown): string {
  try {
    const sanitized = sanitizeValue(value);
    return JSON.stringify(sanitized, null, 2);
  } catch {
    return '[Circular or Non-serializable]';
  }
}

interface GraphState {
  filename?: string;
  [key: string]: unknown;
}

interface AuditLogger {
  logGraphStart: (runId: string, initialState: GraphState, runType?: string) => void;
  logGraphEnd: (runId: string, finalState: GraphState) => void;
  logNodeStart: (runId: string, nodeName: string, input: unknown, filePath?: string) => void;
  logNodeEnd: (runId: string, nodeName: string, output: unknown) => void;
  logToolCall: (runId: string, toolName: string, input: unknown, output: unknown) => void;
  logLLMUsage: (runId: string, nodeName: string, modelName: string, prompt: unknown, response: unknown) => void;
  logError: (runId: string, context: string, error: unknown) => void;
}

const auditLogger: AuditLogger = {
  logGraphStart: (runId: string, initialState: GraphState, runType = 'Standard') => {
    const timestamp = formatTimestamp();
    const filename = initialState.filename || 'Unknown File';
    const content = `${SEPARATOR}# Graph Execution Started [${runType}]\n**Timestamp:** ${timestamp}\n**File:** ${filename}\n**Run ID:** ${runId}\n\n## Initial State\n\`\`\`json\n${formatValue(initialState)}\n\`\`\`\n`;
    appendLog(content);
  },

  logGraphEnd: (runId: string, finalState: GraphState) => {
    const timestamp = formatTimestamp();
    const content = `\n## Graph Execution Finished\n**Run ID:** ${runId}\n**Timestamp:** ${timestamp}\n\n## Final State\n\`\`\`json\n${formatValue(finalState)}\n\`\`\`\n${SEPARATOR}`;
    appendLog(content);
  },

  logNodeStart: (runId: string, nodeName: string, input: unknown, filePath?: string) => {
    const timestamp = formatTimestamp();
    const fileInfo = filePath ? `\n**Source:** \`${filePath}\`` : '';
    const content = `\n### Node Started: ${nodeName}\n**Timestamp:** ${timestamp}${fileInfo}\n\n**Input:**\n\`\`\`json\n${formatValue(input)}\n\`\`\`\n`;
    appendLog(content);
  },

  logNodeEnd: (runId: string, nodeName: string, output: unknown) => {
    const timestamp = formatTimestamp();
    const content = `\n### Node Finished: ${nodeName}\n**Timestamp:** ${timestamp}\n\n**Output:**\n\`\`\`json\n${formatValue(output)}\n\`\`\`\n`;
    appendLog(content);
  },

  logToolCall: (runId: string, toolName: string, input: unknown, output: unknown) => {
    const timestamp = formatTimestamp();
    const content = `\n#### Tool Used: ${toolName}\n**Timestamp:** ${timestamp}\n\n**Input:**\n\`\`\`json\n${formatValue(input)}\n\`\`\`\n\n**Output:**\n\`\`\`json\n${formatValue(output)}\n\`\`\`\n`;
    appendLog(content);
  },

  logLLMUsage: (runId: string, nodeName: string, modelName: string, prompt: unknown, response: unknown) => {
    const timestamp = formatTimestamp();
    const content = `\n#### LLM Used in ${nodeName}\n**Timestamp:** ${timestamp}\n**Model:** ${modelName}\n\n**Prompt:**\n\`\`\`json\n${formatValue(prompt)}\n\`\`\`\n\n**Response:**\n\`\`\`\n${response}\n\`\`\`\n`;
    appendLog(content);
  },

  logError: (runId: string, context: string, error: unknown) => {
    const timestamp = formatTimestamp();
    const err = error as Error | null | undefined;
    const errorMessage = err?.message ?? String(error);
    const errorStack = err?.stack ?? 'No stack trace available';
    const content = `\n## Error\n**Run ID:** ${runId}\n**Timestamp:** ${timestamp}\n**Context:** ${context}\n\n**Error Message:**\n\`\`\`\n${errorMessage}\n\`\`\`\n\n**Stack Trace:**\n\`\`\`\n${errorStack}\n\`\`\`\n`;
    appendLog(content);
  },
};

export = auditLogger;
