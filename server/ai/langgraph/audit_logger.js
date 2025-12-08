const fs = require('fs');
const path = require('path');

const LOG_FILE_PATH = path.join(__dirname, '../../../langgraph_execution.md');

// Ensure the file exists and write a startup message
try {
  fs.appendFileSync(LOG_FILE_PATH, `\n\n# Logger Initialized at ${new Date().toISOString()}\n`);
  console.log(`[AuditLogger] Logging to ${LOG_FILE_PATH}`);
} catch (err) {
  console.error('[AuditLogger] Failed to initialize log file:', err);
}

function appendLog(content) {
  try {
    fs.appendFileSync(LOG_FILE_PATH, content + '\n');
    console.log('[AuditLogger] Wrote to file');
  } catch (err) {
    console.error('[AuditLogger] Failed to write to audit log:', err);
  }
}

function formatTimestamp() {
  const now = new Date();
  return `${now.toISOString()} (Local: ${now.toLocaleString()})`;
}

function sanitizeValue(value, depth = 0) {
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
      const sanitized = value.slice(0, 10).map(v => sanitizeValue(v, depth + 1));
      sanitized.push(`... [truncated ${value.length - 10} items]`);
      return sanitized;
    }
    return value.map(v => sanitizeValue(v, depth + 1));
  }

  if (typeof value === 'object') {
    const sanitized = {};
    
    // Skip binary/bloated metadata fields entirely
    const skipKeys = [
      'fileBuffer', 'imageBase64', 'url',
      'ProfileCMMType', 'ProfileVersion', 'ProfileClass', 'ColorSpaceData',
      'ProfileConnectionSpace', 'ProfileDateTime', 'ProfileFileSignature',
      'PrimaryPlatform', 'DeviceManufacturer', 'RenderingIntent',
      'ProfileCreator', 'ProfileDescription', 'ProfileCopyright',
      'MediaWhitePoint', 'RedMatrixColumn', 'GreenMatrixColumn', 'BlueMatrixColumn',
      'RedTRC', 'GreenTRC', 'BlueTRC', 'ChromaticAdaptation',
      'Regions', 'RegionList', 'AppliedToDimensions', 'CreatorTool'
    ];
    
    for (const key of Object.keys(value)) {
      if (skipKeys.includes(key)) {
        sanitized[key] = '[Omitted for brevity]';
      } else if (key === 'metadata' && depth === 0) {
        // For top-level metadata, only keep GPS and essential fields
        const meta = value[key];
        if (meta && typeof meta === 'object') {
          sanitized[key] = {
            date: meta.CreateDate || meta.DateTimeOriginal || meta.ModifyDate || '[Omitted]',
            GPSLatitude: meta.GPSLatitude || meta.latitude,
            GPSLongitude: meta.GPSLongitude || meta.longitude,
            GPSAltitude: meta.GPSAltitude,
            GPSImgDirection: meta.GPSImgDirection,
            GPSDestBearing: meta.GPSDestBearing,
            gps: meta.gps,
            GPS: meta.GPS,
            camera: meta.Make || meta.Model || '[Omitted]',
            '...': '[Other metadata omitted for brevity]'
          };
        } else {
          sanitized[key] = meta;
        }
      } else if (key === 'poiCache' && depth > 0) {
        sanitized[key] = '[Omitted for brevity]';
      } else {
        sanitized[key] = sanitizeValue(value[key], depth + 1);
      }
    }
    return sanitized;
  }

  return value;
}

function formatValue(value) {
  try {
    const sanitized = sanitizeValue(value);
    return JSON.stringify(sanitized, null, 2);
  } catch {
    return '[Circular or Non-serializable]';
  }
}

const auditLogger = {
  logGraphStart: (runId, initialState, runType = 'Standard') => {
    // Clear the log file before starting a new graph
    try {
      fs.writeFileSync(LOG_FILE_PATH, '');
      console.log('[AuditLogger] Log file cleared for new graph execution');
    } catch (err) {
      console.error('[AuditLogger] Failed to clear log file:', err);
    }
    
    const timestamp = formatTimestamp();
    const filename = initialState.filename || 'Unknown File';
    const separator = '\n' + '='.repeat(80) + '\n';
    const content = `${separator}# Graph Execution Started [${runType}]\n**Timestamp:** ${timestamp}\n**File:** ${filename}\n**Run ID:** ${runId}\n\n## Initial State\n\`\`\`json\n${formatValue(initialState)}\n\`\`\`\n`;
    appendLog(content);
  },

  logGraphEnd: (runId, finalState) => {
    const timestamp = formatTimestamp();
    const separator = '\n' + '='.repeat(80) + '\n';
    const content = `\n## Graph Execution Finished\n**Run ID:** ${runId}\n**Timestamp:** ${timestamp}\n\n## Final State\n\`\`\`json\n${formatValue(finalState)}\n\`\`\`\n${separator}`;
    appendLog(content);
  },

  logNodeStart: (runId, nodeName, input, filePath) => {
    const timestamp = formatTimestamp();
    const fileInfo = filePath ? `\n**Source:** \`${filePath}\`` : '';
    const content = `\n### Node Started: ${nodeName}\n**Timestamp:** ${timestamp}${fileInfo}\n\n**Input:**\n\`\`\`json\n${formatValue(input)}\n\`\`\`\n`;
    appendLog(content);
  },

  logNodeEnd: (runId, nodeName, output) => {
    const timestamp = formatTimestamp();
    const content = `\n### Node Finished: ${nodeName}\n**Timestamp:** ${timestamp}\n\n**Output:**\n\`\`\`json\n${formatValue(output)}\n\`\`\`\n`;
    appendLog(content);
  },

  logToolCall: (runId, toolName, input, output) => {
    const timestamp = formatTimestamp();
    const content = `\n#### Tool Used: ${toolName}\n**Timestamp:** ${timestamp}\n\n**Input:**\n\`\`\`json\n${formatValue(input)}\n\`\`\`\n\n**Output:**\n\`\`\`json\n${formatValue(output)}\n\`\`\`\n`;
    appendLog(content);
  },
  
  logLLMUsage: (runId, nodeName, modelName, prompt, response) => {
      const timestamp = formatTimestamp();
      const content = `\n#### LLM Used in ${nodeName}\n**Timestamp:** ${timestamp}\n**Model:** ${modelName}\n\n**Prompt:**\n\`\`\`json\n${formatValue(prompt)}\n\`\`\`\n\n**Response:**\n\`\`\`\n${response}\n\`\`\`\n`;
      appendLog(content);
  },

  logError: (runId, context, error) => {
    const timestamp = formatTimestamp();
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack || 'No stack trace available';
    const content = `\n## ❌ Error\n**Run ID:** ${runId}\n**Timestamp:** ${timestamp}\n**Context:** ${context}\n\n**Error Message:**\n\`\`\`\n${errorMessage}\n\`\`\`\n\n**Stack Trace:**\n\`\`\`\n${errorStack}\n\`\`\`\n`;
    appendLog(content);
  }
};

module.exports = auditLogger;
