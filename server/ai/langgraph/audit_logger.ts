const AUDIT_LOGGER_ENABLED: boolean = process.env.AI_AUDIT_LOGGER_ENABLED === 'true' && process.env.NODE_ENV !== 'production';

if (AUDIT_LOGGER_ENABLED) {
  console.log(`[AuditLogger] Enabled (stdout)`);
}

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

function sanitizeValue(value: unknown, depth: number = 0): unknown {
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
    // If array is too long, truncate it
    if (value.length > 10) {
      const sanitized: unknown[] = value.slice(0, 10).map(v => sanitizeValue(v, depth + 1));
      sanitized.push(`... [truncated ${value.length - 10} items]`);
      return sanitized;
    }
    return value.map(v => sanitizeValue(v, depth + 1));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    
    // Skip binary/bloated metadata fields entirely
    const skipKeys: string[] = [
      'fileBuffer', 'imageBase64', 'url',
      'ProfileCMMType', 'ProfileVersion', 'ProfileClass', 'ColorSpaceData',
      'ProfileConnectionSpace', 'ProfileDateTime', 'ProfileFileSignature',
      'PrimaryPlatform', 'DeviceManufacturer', 'RenderingIntent',
      'ProfileCreator', 'ProfileDescription', 'ProfileCopyright',
      'MediaWhitePoint', 'RedMatrixColumn', 'GreenMatrixColumn', 'BlueMatrixColumn',
      'RedTRC', 'GreenTRC', 'BlueTRC', 'ChromaticAdaptation',
      'Regions', 'RegionList', 'AppliedToDimensions', 'CreatorTool'
    ];
    
    for (const key of Object.keys(obj)) {
      if (skipKeys.includes(key)) {
        sanitized[key] = '[Omitted for brevity]';
      } else if (key === 'metadata' && depth === 0) {
        // For top-level metadata, only keep GPS and essential fields
        const meta = obj[key] as Record<string, unknown> | null;
        if (meta && typeof meta === 'object') {
          sanitized[key] = {
            date: (meta as Record<string, unknown>).CreateDate || (meta as Record<string, unknown>).DateTimeOriginal || (meta as Record<string, unknown>).ModifyDate || '[Omitted]',
            GPSLatitude: (meta as Record<string, unknown>).GPSLatitude || (meta as Record<string, unknown>).latitude,
            GPSLongitude: (meta as Record<string, unknown>).GPSLongitude || (meta as Record<string, unknown>).longitude,
            GPSAltitude: (meta as Record<string, unknown>).GPSAltitude,
            GPSImgDirection: (meta as Record<string, unknown>).GPSImgDirection,
            GPSDestBearing: (meta as Record<string, unknown>).GPSDestBearing,
            gps: (meta as Record<string, unknown>).gps,
            GPS: (meta as Record<string, unknown>).GPS,
            camera: (meta as Record<string, unknown>).Make || (meta as Record<string, unknown>).Model || '[Omitted]',
            '...': '[Other metadata omitted for brevity]'
          };
        } else {
          sanitized[key] = meta;
        }
      } else if (key === 'collectible_valuation' && obj[key]) {
        const val = obj[key] as Record<string, unknown>;
        sanitized[key] = {
          currency: val.currency,
          low: val.low,
          high: val.high,
          marketDataPoints: Array.isArray(val.market_data) ? val.market_data.length : 0
        };
      } else if (key === 'collectible' && obj[key]) {
        const c = (obj[key] || {}) as Record<string, Record<string, unknown> | null>;
        sanitized[key] = {
          identification: c.identification
            ? {
                id: c.identification.id,
                category: c.identification.category,
                confidence: c.identification.confidence,
                source: c.identification.source,
              }
            : null,
          review: c.review
            ? {
                status: c.review.status,
                ticketId: c.review.ticketId,
                confirmedBy: c.review.confirmedBy,
                confirmedAt: c.review.confirmedAt,
                version: c.review.version,
                expiresAt: c.review.expiresAt,
                editHistoryCount: Array.isArray(c.review.editHistory) ? c.review.editHistory.length : 0,
              }
            : null,
          valuationSummary: c.valuation
            ? {
                currency: c.valuation.currency,
                low: c.valuation.low,
                high: c.valuation.high,
                marketDataPoints: Array.isArray(c.valuation.market_data) ? (c.valuation.market_data as unknown[]).length : 0,
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
  logLLMUsage: (runId: string, nodeName: string, modelName: string, prompt: unknown, response: string) => void;
  logError: (runId: string, context: string, error: Error | unknown) => void;
}

const auditLogger: AuditLogger = {
  logGraphStart: (runId: string, initialState: GraphState, runType: string = 'Standard') => {
    const timestamp = formatTimestamp();
    const filename = initialState.filename || 'Unknown File';
    const separator = '\n' + '='.repeat(80) + '\n';
    const content = `${separator}# Graph Execution Started [${runType}]\n**Timestamp:** ${timestamp}\n**File:** ${filename}\n**Run ID:** ${runId}\n\n## Initial State\n\`\`\`json\n${formatValue(initialState)}\n\`\`\`\n`;
    appendLog(content);
  },

  logGraphEnd: (runId: string, finalState: GraphState) => {
    const timestamp = formatTimestamp();
    const separator = '\n' + '='.repeat(80) + '\n';
    const content = `\n## Graph Execution Finished\n**Run ID:** ${runId}\n**Timestamp:** ${timestamp}\n\n## Final State\n\`\`\`json\n${formatValue(finalState)}\n\`\`\`\n${separator}`;
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
  
  logLLMUsage: (runId: string, nodeName: string, modelName: string, prompt: unknown, response: string) => {
      const timestamp = formatTimestamp();
      const content = `\n#### LLM Used in ${nodeName}\n**Timestamp:** ${timestamp}\n**Model:** ${modelName}\n\n**Prompt:**\n\`\`\`json\n${formatValue(prompt)}\n\`\`\`\n\n**Response:**\n\`\`\`\n${response}\n\`\`\`\n`;
      appendLog(content);
  },

  logError: (runId: string, context: string, error: Error | unknown) => {
    const timestamp = formatTimestamp();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack || 'No stack trace available' : 'No stack trace available';
    const content = `\n## ❌ Error\n**Run ID:** ${runId}\n**Timestamp:** ${timestamp}\n**Context:** ${context}\n\n**Error Message:**\n\`\`\`\n${errorMessage}\n\`\`\`\n\n**Stack Trace:**\n\`\`\`\n${errorStack}\n\`\`\`\n`;
    appendLog(content);
  }
};

export = auditLogger;
