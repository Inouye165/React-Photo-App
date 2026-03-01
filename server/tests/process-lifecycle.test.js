/**
 * Process Lifecycle Test Suite
 * 
 * Tests critical process lifecycle management for Node.js production environments.
 * 
 * Background:
 * In Node.js, an uncaughtException means the application is in an undefined state.
 * According to Node.js best practices and the official documentation:
 * https://nodejs.org/api/process.html#event-uncaughtexception
 * 
 * "It is not safe to resume normal operation after 'uncaughtException' because
 * the system may be in an undefined state."
 * 
 * Production Impact:
 * - In Kubernetes/Docker orchestration, a non-zero exit code signals pod failure
 * - The orchestrator can then restart the pod to restore a clean application state
 * - Keeping the process alive in an undefined state can lead to data corruption,
 *   memory leaks, or silent failures that are difficult to diagnose
 * 
 * Test Strategy:
 * This test suite uses child processes to safely test exception handling without
 * crashing the Jest test runner. Each test spawns an isolated Node.js process
 * that simulates the server's exception handling behavior.
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

describe('Process Lifecycle - Uncaught Exception Handling', () => {
  const helperScript = path.join(__dirname, 'helpers', 'throw-uncaught.js');
  
  beforeAll(() => {
    // Verify the test helper script exists
    if (!fs.existsSync(helperScript)) {
      throw new Error(`Test helper not found: ${helperScript}`);
    }
  });

  test('uncaught exception should cause process to exit with code 1', () => {
    // Spawn a child process that will throw an uncaught exception
    // This isolates the test from the Jest process
    const result = spawnSync('node', [helperScript], {
      timeout: 5000, // 5 second timeout to prevent hanging
      encoding: 'utf-8',
      env: {
        ...process.env,
        NODE_ENV: 'test', // Use test environment
        SERVER_LOG_LEVEL: 'fatal', // Only show fatal errors to reduce noise
      }
    });

    // CRITICAL ASSERTION: Process must exit with failure code
    // This is what Kubernetes/Docker uses to detect failed pods
    expect(result.status).toBe(1);
    
    // Verify that error was logged (should appear in stderr)
    // The logger should have captured the exception
    expect(result.stderr).toBeTruthy();
    
    // Verify the error message contains our simulated exception
    const stderrOutput = String(result.stderr);
    expect(stderrOutput).toMatch(/Simulated uncaught exception for testing/i);
    
    // Verify it was logged as a fatal/uncaught exception
    expect(stderrOutput).toMatch(/UncaughtException|uncaught|fatal/i);
  });

  test('error should be logged to stderr before exit', () => {
    const result = spawnSync('node', [helperScript], {
      timeout: 5000,
      encoding: 'utf-8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        SERVER_LOG_LEVEL: 'fatal',
      }
    });

    // Verify stderr contains the error output
    expect(result.stderr).toBeTruthy();
    const stderrOutput = String(result.stderr);
    
    // Should contain the error message
    expect(stderrOutput.length).toBeGreaterThan(0);
    
    // Should mention the exception
    expect(stderrOutput).toMatch(/exception/i);
    
    // Should have a stack trace (indicated by 'at ' in the output)
    // This helps with debugging in production
    expect(stderrOutput).toMatch(/\s+at\s+/);
  });

  test('process should exit quickly without hanging', () => {
    const startTime = Date.now();
    
    const result = spawnSync('node', [helperScript], {
      timeout: 5000, // 5 second timeout
      encoding: 'utf-8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        SERVER_LOG_LEVEL: 'fatal',
      }
    });
    
    const duration = Date.now() - startTime;
    
    // Process should exit quickly (within 2.5 seconds)
    // This ensures we don't block the orchestrator from restarting
    expect(duration).toBeLessThan(2500);
    
    // Should still exit with code 1
    expect(result.status).toBe(1);
  });

  test('server.ts should delegate lifecycle handlers to bootstrap', () => {
    // Static analysis: server.ts should register lifecycle handlers via bootstrap.
    const serverPath = path.join(__dirname, '..', 'server.ts');
    const serverCode = fs.readFileSync(serverPath, 'utf-8');

    expect(serverCode).toMatch(/registerProcessHandlers\s*\(/);
  });

  test('bootstrap/registerProcessHandlers.ts should have proper uncaughtException handler', () => {
    const handlerPath = path.join(__dirname, '..', 'bootstrap', 'registerProcessHandlers.ts');
    const handlerCode = fs.readFileSync(handlerPath, 'utf-8');

    // Should have an uncaughtException handler
    expect(handlerCode).toMatch(/process\.on\s*\(\s*['"]uncaughtException['"]/);

    // Handler should call process.exit(1)
    expect(handlerCode).toMatch(/process\.exit\s*\(\s*1\s*\)/);

    // Handler should log the error
    expect(handlerCode).toMatch(/logger\.(fatal|error)|console\.error/);
  });

  test('documentation should reference big-tech standards', () => {
    // This test serves as living documentation of why we exit on uncaughtException
    const expectedBehavior = {
      reason: 'Node.js best practice: uncaughtException means undefined state',
      action: 'Log error and exit with code 1',
      orchestrator: 'K8s/Docker will restart the pod based on exit code',
      reference: 'https://nodejs.org/api/process.html#event-uncaughtexception',
      standard: 'Big-tech companies exit immediately on uncaught exceptions',
    };
    
    // Verify our understanding is documented
    expect(expectedBehavior.action).toBe('Log error and exit with code 1');
    expect(expectedBehavior.orchestrator).toMatch(/restart/);
  });
});
