> Historical note: This is a point-in-time log. Paths, scripts, or auth models may not match the current main branch.

# CI Fix Summary

## Issue
The CI workflow was failing, likely due to the `idor_legacy.test.js` test failing.
The test was failing because it set up mock data in `beforeAll`, but the global `server/tests/setup.js` clears all mock data in `beforeEach`. This meant the test ran with empty mock data, causing 404 errors when trying to access the photo.

## Fix
Refactored `server/tests/idor_legacy.test.js` to:
1.  Move mock data setup (users, tokens, photos, storage files) from `beforeAll` to `beforeEach`.
2.  Use `mockStorageHelpers` and `mockDbHelpers` from `./setup` for consistency with other tests.
3.  Remove manual mock of `../lib/supabaseClient` and rely on the global mock provided by `setup.js`.

## Verification
Ran `npm run test:ci` locally and verified that all tests, including `idor_legacy.test.js`, now pass.
