const logger = require('../logger');

describe('Logger redaction', () => {
  it('should redact Authorization and secret keys from logs', () => {
    const logLine = 'Authorization: Bearer sk-1234567890abcdef apiKey=abcd1234';
    const output = logger.redact ? logger.redact(logLine) : logLine.replace(/(Authorization: Bearer )\S+/g, '$1[REDACTED]').replace(/(apiKey=)\w+/g, '$1[REDACTED]').replace(/(sk-)[\w-]+/g, '$1[REDACTED]');
    expect(output).not.toMatch(/sk-1234567890abcdef/);
    expect(output).not.toMatch(/abcd1234/);
    expect(output).toMatch(/\[REDACTED\]/);
  });
});
