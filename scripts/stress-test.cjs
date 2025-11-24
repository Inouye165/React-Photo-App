#!/usr/bin/env node
/**
 * Stress Test Runner
 * 
 * Runs the test suite multiple times to detect race conditions and intermittent failures.
 * These types of bugs often pass 95% of the time but fail randomly in CI environments.
 * 
 * Usage:
 *   node scripts/stress-test.cjs [options]
 * 
 * Options:
 *   --runs <number>      Number of times to run the tests (default: 20)
 *   --parallel <number>  Number of parallel runs (default: 1, sequential)
 *   --bail              Stop on first failure
 *   --target <path>     Target directory (default: server)
 * 
 * Examples:
 *   npm run stress-test                    # Run 20 times sequentially
 *   npm run stress-test -- --runs 50      # Run 50 times
 *   npm run stress-test -- --parallel 4   # Run 4 tests in parallel
 *   npm run stress-test -- --bail         # Stop after first failure
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (flag, defaultValue) => {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
};

const RUNS = parseInt(getArg('--runs', '20'), 10);
const PARALLEL = parseInt(getArg('--parallel', '1'), 10);
const BAIL = args.includes('--bail');
const TARGET = getArg('--target', 'server');

const targetPath = path.join(__dirname, '..', TARGET);

// Validate target directory
if (!fs.existsSync(targetPath)) {
  console.error(`❌ Target directory not found: ${targetPath}`);
  process.exit(1);
}

console.log('🔄 Starting Stress Test');
console.log('━'.repeat(60));
console.log(`📁 Target:    ${TARGET}`);
console.log(`🔢 Runs:      ${RUNS}`);
console.log(`⚡ Parallel:  ${PARALLEL}`);
console.log(`🛑 Bail:      ${BAIL ? 'Yes' : 'No'}`);
console.log('━'.repeat(60));
console.log();

const results = {
  passed: 0,
  failed: 0,
  errors: [],
  startTime: Date.now()
};

let runningTests = 0;
let completedTests = 0;
let shouldStop = false;

/**
 * Run a single test iteration
 */
function runTest(runNumber) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const testProcess = spawn('npm', ['test'], {
      cwd: targetPath,
      shell: true,
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    testProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    testProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    testProcess.on('close', (code) => {
      const duration = Date.now() - startTime;
      const success = code === 0;

      if (success) {
        results.passed++;
        console.log(`✅ Run ${runNumber}/${RUNS} passed (${(duration / 1000).toFixed(1)}s)`);
      } else {
        results.failed++;
        console.log(`❌ Run ${runNumber}/${RUNS} FAILED (${(duration / 1000).toFixed(1)}s)`);
        results.errors.push({
          run: runNumber,
          exitCode: code,
          stdout: stdout.slice(-500), // Last 500 chars
          stderr: stderr.slice(-500)
        });

        if (BAIL) {
          console.log('\n🛑 Stopping on first failure (--bail mode)\n');
          shouldStop = true;
        }
      }

      resolve(success);
    });

    testProcess.on('error', (err) => {
      results.failed++;
      console.log(`❌ Run ${runNumber}/${RUNS} ERROR: ${err.message}`);
      results.errors.push({
        run: runNumber,
        error: err.message
      });
      resolve(false);
    });
  });
}

/**
 * Run tests in batches with controlled parallelism
 */
async function runStressTest() {
  const queue = Array.from({ length: RUNS }, (_, i) => i + 1);
  const running = [];

  while (queue.length > 0 || running.length > 0) {
    // Exit early if bail mode triggered
    if (shouldStop) {
      break;
    }

    // Start new tests up to parallel limit
    while (running.length < PARALLEL && queue.length > 0) {
      const runNumber = queue.shift();
      const promise = runTest(runNumber).then((success) => {
        completedTests++;
        const index = running.indexOf(promise);
        if (index !== -1) running.splice(index, 1);
        return success;
      });
      running.push(promise);
    }

    // Wait for at least one test to complete
    if (running.length > 0) {
      await Promise.race(running);
    }
  }

  // Wait for remaining tests
  await Promise.all(running);
}

// Run the stress test
runStressTest()
  .then(() => {
    const totalTime = ((Date.now() - results.startTime) / 1000).toFixed(1);
    const successRate = ((results.passed / (results.passed + results.failed)) * 100).toFixed(1);

    console.log();
    console.log('━'.repeat(60));
    console.log('📊 STRESS TEST RESULTS');
    console.log('━'.repeat(60));
    console.log(`✅ Passed:        ${results.passed}`);
    console.log(`❌ Failed:        ${results.failed}`);
    console.log(`📈 Success Rate:  ${successRate}%`);
    console.log(`⏱️  Total Time:    ${totalTime}s`);
    console.log('━'.repeat(60));

    if (results.failed > 0) {
      console.log();
      console.log('🔍 FAILURE DETAILS');
      console.log('━'.repeat(60));
      
      results.errors.forEach((error, index) => {
        console.log(`\nFailure ${index + 1} (Run ${error.run}):`);
        console.log('─'.repeat(40));
        
        if (error.exitCode !== undefined) {
          console.log(`Exit Code: ${error.exitCode}`);
        }
        
        if (error.error) {
          console.log(`Error: ${error.error}`);
        }
        
        if (error.stderr) {
          console.log('\nStderr (last 500 chars):');
          console.log(error.stderr);
        }
        
        if (error.stdout) {
          console.log('\nStdout (last 500 chars):');
          console.log(error.stdout);
        }
      });

      console.log();
      console.log('━'.repeat(60));
      console.log('💡 RECOMMENDATIONS');
      console.log('━'.repeat(60));
      console.log('• Intermittent failures indicate race conditions or timing issues');
      console.log('• Check for global state that is not properly reset between tests');
      console.log('• Look for async operations that may not be properly awaited');
      console.log('• Consider adding delays or retries in CI environment');
      console.log('• Review the failed test logs above for patterns');
      console.log('━'.repeat(60));
      console.log();

      process.exit(1);
    } else {
      console.log();
      console.log('🎉 All tests passed! No race conditions detected.');
      console.log();
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('❌ Stress test runner crashed:', err);
    process.exit(1);
  });
