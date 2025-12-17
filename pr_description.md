## 🚀 Description
This PR improves gallery load performance by eliminating Authorization-header thumbnail fetches (and their CORS preflights) while keeping access control intact.

## 🛠️ Changes
### 🖼️ Signed thumbnail URLs in `/photos`
- `/photos` now returns `photo.thumbnail` as a signed URL string:
  - `/display/thumbnails/<hash>.jpg?sig=<...>&exp=<...>`
- The display route already supports signature-only thumbnail requests:
  - Valid signature → `200` without cookies/Authorization.
  - Missing/invalid signature → falls back to legacy cookie/Bearer auth (or rejects).

### ⚡ Frontend avoids per-photo signing calls
- The client detects when `photo.thumbnail` is already signed and uses it directly.
- This avoids making one `/photos/:id/thumbnail-url` request per photo during gallery render.

## 📈 Expected Perf Impact
- Fewer network round trips (no per-photo signed-url fetches for thumbnails).
- No CORS preflight fanout for thumbnail loads (standard `<img src>` requests, no custom headers).
- Better cache behavior due to stable signature windows.

## ✅ Verification
- Web: `npm run test:run -- src/hooks/useSignedThumbnails.test.js`
- Server: `cd server && npm test -- thumbnailUrl.integration.test.js`
- Lint: `npm run lint`
- Typecheck: `npx tsc -p tsconfig.json --noEmit`