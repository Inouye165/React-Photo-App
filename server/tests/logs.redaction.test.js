describe('Log Redaction Security', () => {
  let logger;
  let spies = {};

  function getFirstCall() {
    const ordered = [spies.log, spies.info, spies.warn, spies.error, spies.debug].filter(Boolean);
    for (const spy of ordered) {
      const first = spy.mock.calls[0];
      if (first) return first;
    }
    return undefined;
  }

  function getLoggedOutput() {
    const ordered = [spies.log, spies.info, spies.warn, spies.error, spies.debug].filter(Boolean);
    return ordered.flatMap(spy => spy.mock.calls.map(call => String(call[0] ?? ''))).join('\n');
  }

  function getFirstLoggedPayload() {
    const firstCall = getFirstCall();
    if (!firstCall) return undefined;

    const safeLine = String(firstCall[0] ?? '');
    try {
      const parsed = JSON.parse(safeLine);

      if (Array.isArray(parsed)) {
        const firstObject = parsed.find(
          (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
        );
        if (firstObject) return firstObject;
      }

      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      if (typeof first === 'string') {
        const trimmed = first.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            return JSON.parse(trimmed);
          } catch {
            return first;
          }
        }
      }
      return first;
    } catch {
      return undefined;
    }
  }

  beforeEach(() => {
    jest.resetModules();
    
    // Spy on all console methods that logger might use
    // We spy BEFORE requiring logger, so logger wraps our spies.
    // This ensures that when logger (or global console) calls the underlying console method,
    // it hits our spy with the REDACTED arguments.
    spies.log = jest.spyOn(console, 'log').mockImplementation(() => {});
    spies.warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    spies.error = jest.spyOn(console, 'error').mockImplementation(() => {});
    spies.info = jest.spyOn(console, 'info').mockImplementation(() => {});
    spies.debug = jest.spyOn(console, 'debug').mockImplementation(() => {});

    // Require logger AFTER spying
    logger = require('../logger');
    logger.setLevel('info');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('redacts sensitive query parameters in strings', () => {
    logger.info('Request to /api/resource?token=secret123&id=5');
    
    // info maps to log in TinyLogger
    const calls = spies.log.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const output = getLoggedOutput();
    
    expect(output).toContain('token=[REDACTED]');
    expect(output).not.toContain('secret123');
    expect(output).toContain('id=5');
  });

  test('redacts sensitive keys in JSON objects', () => {
    const sensitiveData = {
      user: 'alice',
      password: 'superSecretPassword',
      meta: {
        apiKey: '12345-key',
        public: 'visible'
      }
    };
    
    logger.info(sensitiveData);

    const output = getLoggedOutput();
    
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('superSecretPassword');
    expect(output).not.toContain('12345-key');
    expect(output).toContain('visible');
  });

  test('redacts URL-encoded parameters', () => {
    logger.info('Redirecting to /login?redirect=https%3A%2F%2Fsite.com%3Ftoken%3DbadToken');

    const output = getLoggedOutput();
    
    expect(output).toContain('token%3D[REDACTED]');
    expect(output).not.toContain('badToken');
  });

  test('handles circular references gracefully', () => {
    const circular = { name: 'loop' };
    circular.self = circular;
    
    expect(() => logger.info(circular)).not.toThrow();
    
    const firstPayload = getFirstLoggedPayload();
    // The redact function returns an object where circular ref is replaced by string '[Circular]'
    expect(firstPayload?.self).toBe('[Circular]');
  });

  test('global console.log is wrapped and redacts', () => {
    // console.log is the WRAPPER now.
    // It calls originalConsole.log (the SPY).
    console.log('System startup with secret=hiddenKey');

    const output = getLoggedOutput();
    
    expect(output).toContain('secret=[REDACTED]');
    expect(output).not.toContain('hiddenKey');
  });
  
  test('redacts Authorization headers', () => {
    const headers = {
      'content-type': 'application/json',
      'Authorization': 'Bearer secret-token-value'
    };
    
    logger.info(headers);

    const firstPayload = getFirstLoggedPayload();
    expect(firstPayload?.Authorization).toBe('[REDACTED]');
    expect(JSON.stringify(firstPayload)).not.toContain('secret-token-value');
  });

  test('redacts Cookie and Set-Cookie headers', () => {
    const headers = {
      cookie: 'authToken=super-secret-cookie; other=value',
      'set-cookie': 'authToken=super-secret-cookie; HttpOnly; Secure',
      Cookie: 'authToken=another-secret',
      'Set-Cookie': 'authToken=another-secret; HttpOnly'
    };

    logger.info(headers);

    const firstPayload = getFirstLoggedPayload();

    expect(firstPayload?.cookie).toBe('[REDACTED]');
    expect(firstPayload?.['set-cookie']).toBe('[REDACTED]');
    expect(firstPayload?.Cookie).toBe('[REDACTED]');
    expect(firstPayload?.['Set-Cookie']).toBe('[REDACTED]');

    const output = JSON.stringify(firstPayload);
    expect(output).not.toContain('super-secret-cookie');
    expect(output).not.toContain('another-secret');
  });
});
