Development notes

This doc exists for one reason: to capture dev-only edge cases and quick repro steps so debugging doesn’t turn into tribal knowledge.

1) Dev-time tolerance (now removed)

- Previously the server included a dev-only text body parser and a best-effort JSON “repair” for `/privilege`.
- That logic was removed to keep the server strict and fail fast when clients send invalid JSON.
- If you need to temporarily re-enable tolerant parsing for local debugging, add the following back into `server/server.js` (development only):

```js
if (process.env.NODE_ENV !== 'production') {
	app.use('/privilege', express.text({ type: 'application/json', limit: '50mb' }));
	// And in the error handler: try repairing req.rawBody before returning an error
}
```

- Recommendation: fix the client to send clean JSON and keep the server strict in production.

2) How to reproduce locally

- Start the server (development):

```pwsh
node server/server.js
```

- Run the included check script (node must be run from the repo root):

```pwsh
node scripts/check-privilege.cjs
# or via npm
npm run check-privilege
```

3) Frontend instrumentation

- `src/api.ts` logs the outgoing JSON body for `checkPrivilege` as `console.log('[API] checkPrivilege ->', serverUrl, 'body:', body);` so you can inspect the exact payload leaving the browser.

4) Next steps

- Keep the server strict: remove any repair heuristics and text parsing once all clients consistently send valid JSON.
- If CI coverage is needed, convert the simple check script into a proper test harness.
