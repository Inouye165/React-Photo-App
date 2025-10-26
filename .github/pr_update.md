Final resolution

This PR implements a final, safe fix for test runs that require (or previously required) an OpenAI API key:

- The code in `server/ai/service.js` was changed to skip the fail-fast check for `OPENAI_API_KEY` when `process.env.NODE_ENV === 'test'`. This preserves the strict throw in development and production while allowing test environments to run without a real API key (tests should mock LangChain/OpenAI agents).

- Because of that guard, the hard-coded `OPENAI_API_KEY` value that was temporarily added to the CI `server-tests` job in `.github/workflows/secret-scan.yml` is no longer necessary and was removed.

Other small changes made in the branch:

- `server/tests/setup.js` sets a dummy `OPENAI_API_KEY` for local test stability (this is optional for CI now since the guard exists).

Verification

- All server tests pass locally after these changes: 12 test suites, 121 tests (see CI/locally for details).

Notes / recommended follow-ups

- If you want CI to run against a real OpenAI key, replace the removed hard-coded CI value with a repository secret (e.g. `TEST_OPENAI_API_KEY`) and reference it in the workflow.
- Alternatively, keep the current behavior — tests run without a key and agents are mocked — which avoids storing any key in CI.

Branch: `fix/test-openai-env`
PR: #16
