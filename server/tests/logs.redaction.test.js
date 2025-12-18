describe('Log Redaction Security', () => {
  let logger;
  let spies = {};

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
    const output = calls.map(args => args.join(' ')).join('\n');
    
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
    
    const calls = spies.log.mock.calls;
    // Helper to stringify objects for checking
    const output = calls.map(args => args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')).join('\n');
    
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('superSecretPassword');
    expect(output).not.toContain('12345-key');
    expect(output).toContain('visible');
  });

  test('redacts URL-encoded parameters', () => {
    logger.info('Redirecting to /login?redirect=https%3A%2F%2Fsite.com%3Ftoken%3DbadToken');
    
    const calls = spies.log.mock.calls;
    const output = calls.map(args => args.join(' ')).join('\n');
    
    expect(output).toContain('token%3D[REDACTED]');
    expect(output).not.toContain('badToken');
  });

  test('handles circular references gracefully', () => {
    const circular = { name: 'loop' };
    circular.self = circular;
    
    expect(() => logger.info(circular)).not.toThrow();
    
    const calls = spies.log.mock.calls;
    const arg = calls[0][0];
    // The redact function returns an object where circular ref is replaced by string '[Circular]'
    expect(arg.self).toBe('[Circular]');
  });

  test('global console.log is wrapped and redacts', () => {
    // console.log is the WRAPPER now.
    // It calls originalConsole.log (the SPY).
    console.log('System startup with secret=hiddenKey');
    
    const calls = spies.log.mock.calls;
    const output = calls.map(args => args.join(' ')).join('\n');
    
    expect(output).toContain('secret=[REDACTED]');
    expect(output).not.toContain('hiddenKey');
  });
  
  test('redacts Authorization headers', () => {
    const headers = {
      'content-type': 'application/json',
      'Authorization': 'Bearer secret-token-value'
    };
    
    logger.info(headers);
    
    const calls = spies.log.mock.calls;
    const arg = calls[0][0];
    
    expect(arg.Authorization).toBe('[REDACTED]');
    expect(JSON.stringify(arg)).not.toContain('secret-token-value');
  });

  test('redacts Cookie and Set-Cookie headers', () => {
    const headers = {
      cookie: 'authToken=super-secret-cookie; other=value',
      'set-cookie': 'authToken=super-secret-cookie; HttpOnly; Secure',
      Cookie: 'authToken=another-secret',
      'Set-Cookie': 'authToken=another-secret; HttpOnly'
    };

    logger.info(headers);

    const calls = spies.log.mock.calls;
    const arg = calls[0][0];

    expect(arg.cookie).toBe('[REDACTED]');
    expect(arg['set-cookie']).toBe('[REDACTED]');
    expect(arg.Cookie).toBe('[REDACTED]');
    expect(arg['Set-Cookie']).toBe('[REDACTED]');

    const output = JSON.stringify(arg);
    expect(output).not.toContain('super-secret-cookie');
    expect(output).not.toContain('another-secret');
  });
});
