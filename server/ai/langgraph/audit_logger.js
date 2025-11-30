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
  } catch (err) {
    console.error('[AuditLogger] Failed to write to audit log:', err);
  }
}

function formatTimestamp() {
  return new Date().toISOString();
}

function sanitizeValue(value, depth = 0) {
  if (depth > 5) return '[Max Depth Reached]';
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  
  if (Buffer.isBuffer(value)) {
    return `[Buffer: ${value.length} bytes]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    if (value.length > 1000) {
      return value.substring(0, 1000) + `... [truncated ${value.length - 1000} chars]`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    // If array is too long, truncate it
    if (value.length > 20) {
      const sanitized = value.slice(0, 20).map(v => sanitizeValue(v, depth + 1));
      sanitized.push(`... [truncated ${value.length - 20} items]`);
      return sanitized;
    }
    return value.map(v => sanitizeValue(v, depth + 1));
  }

  if (typeof value === 'object') {
    const sanitized = {};
    for (const key of Object.keys(value)) {
      // Redact/Truncate specific heavy keys
      if (key === 'fileBuffer') {
        sanitized[key] = `[Buffer: ${value[key]?.length || 'unknown'} bytes]`;
      } else if (key === 'imageBase64') {
        sanitized[key] = '[Base64 Image Data Omitted]';
      } else if (key === 'url' && typeof value[key] === 'string' && value[key].startsWith('data:')) {
        sanitized[key] = '[Base64 Image Data Omitted]';
      } else if (key === 'poiCache' && depth > 0) {
         // Summarize poiCache if nested deep or just to save space
         sanitized[key] = sanitizeValue(value[key], depth + 1);
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
  logGraphStart: (runId, initialState) => {
    const timestamp = formatTimestamp();
    const separator = '\n' + '='.repeat(80) + '\n';
    const content = `${separator}# Graph Execution Started\n**Run ID:** ${runId}\n**Timestamp:** ${timestamp}\n\n## Initial State\n\`\`\`json\n${formatValue(initialState)}\n\`\`\`\n`;
    appendLog(content);
  },

  logGraphEnd: (runId, finalState) => {
    const timestamp = formatTimestamp();
    const separator = '\n' + '='.repeat(80) + '\n';
    const content = `\n## Graph Execution Finished\n**Run ID:** ${runId}\n**Timestamp:** ${timestamp}\n\n## Final State\n\`\`\`json\n${formatValue(finalState)}\n\`\`\`\n${separator}`;
    appendLog(content);
  },

  logNodeStart: (runId, nodeName, input) => {
    const timestamp = formatTimestamp();
    const content = `\n### Node Started: ${nodeName}\n**Timestamp:** ${timestamp}\n\n**Input:**\n\`\`\`json\n${formatValue(input)}\n\`\`\`\n`;
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
  }
};

module.exports = auditLogger;
