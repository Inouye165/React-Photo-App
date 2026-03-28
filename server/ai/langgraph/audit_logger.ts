// server/ai/langgraph/audit_logger.ts
// Structured audit logger for the LangGraph AI pipeline.
// Emits to stdout only; writing user-controlled content to files is intentionally avoided.

const AUDIT_LOGGER_ENABLED =
  process.env.AI_AUDIT_LOGGER_ENABLED === 'true' && process.env.NODE_ENV !== 'production';

if (AUDIT_LOGGER_ENABLED) {
  console.log('[AuditLogger] Enabled (stdout)');
}

/** Keys whose values should be omitted from audit logs to keep output manageable. */
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

function appendLog(content: string): void {
  if (!AUDIT_LOGGER_ENABLED) return;
  try {
    // Avoid writing potentially user-controlled content to local files.
    // Emit to stdout for dev debugging instead.
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
      const sanitized: unknown[] = value.slice(0, 10).map((v) => sanitizeValue(v, depth + 1));
      sanitized.push(`... [truncated ${value.length - 10} items]`);
      return sanitized;
    }
    return value.map((v) => sanitizeValue(v, depth + 1));
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
            date: (meta.CreateDate ?? meta.DateTimeOriginal ?? meta.ModifyDate ?? '[Omitted]') as string,
            GPSLatitude: (meta.GPSLatitude ?? meta.latitude) as string,
            GPSLongitude: (meta.GPSLongitude ?? meta.longitude) as string,
            GPSAltitude: meta.GPSAltitude as string,
            GPSImgDirection: meta.GPSImgDirection as string,
            GPSDestBearing: meta.GPSDestBearing as string,
            gps: meta.gps as string,
            GPS: meta.GPS as string,
            camera: (meta.Make ?? meta.Model ?? '[Omitted]') as string,
            '...': '[Other metadata omitted for brevity]',
          };
        } else {
          sanitized[key] = meta;
        }
      } else if (key === 'collectible_valuation' && obj[key]) {
        const val = obj[key] as Record<string, unknown>;
        sanitized[key] = {
          currency: val.currency as string,
          low: String(val.low),
          high: String(val.high),
          marketDataPoints: String(Array.isArray(val.market_data) ? val.market_data.length : 0),
        };
      } else if (key === 'collectible' && obj[key]) {
        const c = (obj[key] ?? {}) as Record<string, Record<string, unknown> | null | undefined>;
        const identification = c.identification;
        const review = c.review;
        const valuation = c.valuation;
        sanitized[key] = {
          identification: identification
            ? {
                id: identification.id as string,
                category: identification.category as string,
                confidence: String(identification.confidence),
                source: identification.source as string,
              }
            : 'null',
          review: review
            ? {
                status: review.status as string,
                ticketId: review.ticketId as string,
                confirmedBy: review.confirmedBy as string,
                confirmedAt: review.confirmedAt as string,
                version: String(review.version),
                expiresAt: review.expiresAt as string,
                editHistoryCount: String(Array.isArray(review.editHistory) ? review.editHistory.length : 0),
              }
            : 'null',
          valuationSummary: valuation
            ? {
                currency: valuation.currency as string,
                low: String(valuation.low),
                high: String(valuation.high),
                marketDataPoints: String(Array.isArray(valuation.market_data) ? valuation.market_data.length : 0),
              }
            : 'null',
        };
      } else if (key === 'poiCache' && depth > 0) {
        sanitized[key] = '[Omitted for brevity]';
      } else {
        sanitized[key] = sanitizeValue(obj[key], depth + 1);
      }
    }
    return sanitized;
  }

  return String(value);
}

function formatValue(value: unknown): string {
  try {
    const sanitized = sanitizeValue(value);
    return JSON.stringify(sanitized, null, 2);
  } catch {
    return '[Circular or Non-serializable]';
  }
}

const SEPARATOR = '\n' + '='.repeat(80) + '\n';

const auditLogger = {
  logGraphStart(runId: string, initialState: unknown, runType = 'Standard'): void {
    const timestamp = formatTimestamp();
    const filename = (initialState as Record<string, unknown>)?.filename ?? 'Unknown File';
    const content = `${SEPARATOR}# Graph Execution Started [${runType}]\n**Timestamp:** ${timestamp}\n**File:** ${filename}\n**Run ID:** ${runId}\n\n## Initial State\n\`\`\`json\n${formatValue(initialState)}\n\`\`\`\n`;
    appendLog(content);
  },

  logGraphEnd(runId: string, finalState: unknown): void {
    const timestamp = formatTimestamp();
    const content = `\n## Graph Execution Finished\n**Run ID:** ${runId}\n**Timestamp:** ${timestamp}\n\n## Final State\n\`\`\`json\n${formatValue(finalState)}\n\`\`\`\n${SEPARATOR}`;
    appendLog(content);
  },

  logNodeStart(runId: string, nodeName: string, input: unknown, filePath?: string): void {
    const timestamp = formatTimestamp();
    const fileInfo = filePath ? `\n**Source:** \`${filePath}\`` : '';
    const content = `\n### Node Started: ${nodeName}\n**Timestamp:** ${timestamp}${fileInfo}\n\n**Input:**\n\`\`\`json\n${formatValue(input)}\n\`\`\`\n`;
    appendLog(content);
  },

  logNodeEnd(runId: string, nodeName: string, output: unknown): void {
    const timestamp = formatTimestamp();
    const content = `\n### Node Finished: ${nodeName}\n**Timestamp:** ${timestamp}\n\n**Output:**\n\`\`\`json\n${formatValue(output)}\n\`\`\`\n`;
    appendLog(content);
  },

  logToolCall(runId: string, toolName: string, input: unknown, output: unknown): void {
    const timestamp = formatTimestamp();
    const content = `\n#### Tool Used: ${toolName}\n**Timestamp:** ${timestamp}\n\n**Input:**\n\`\`\`json\n${formatValue(input)}\n\`\`\`\n\n**Output:**\n\`\`\`json\n${formatValue(output)}\n\`\`\`\n`;
    appendLog(content);
  },

  logLLMUsage(runId: string, nodeName: string, modelName: string, prompt: unknown, response: unknown): void {
    const timestamp = formatTimestamp();
    const content = `\n#### LLM Used in ${nodeName}\n**Timestamp:** ${timestamp}\n**Model:** ${modelName}\n\n**Prompt:**\n\`\`\`json\n${formatValue(prompt)}\n\`\`\`\n\n**Response:**\n\`\`\`\n${response}\n\`\`\`\n`;
    appendLog(content);
  },

  logError(runId: string, context: string, error: unknown): void {
    const timestamp = formatTimestamp();
    const err = error as Error | null | undefined;
    const errorMessage = err?.message ?? String(error);
    const errorStack = err?.stack ?? 'No stack trace available';
    const content = `\n## ❌ Error\n**Run ID:** ${runId}\n**Timestamp:** ${timestamp}\n**Context:** ${context}\n\n**Error Message:**\n\`\`\`\n${errorMessage}\n\`\`\`\n\n**Stack Trace:**\n\`\`\`\n${errorStack}\n\`\`\`\n`;
    appendLog(content);
  },
};

export = auditLogger;
