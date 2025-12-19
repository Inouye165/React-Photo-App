# Project Roadmap & Improvement Plan

This document contains the full list of phased TODO items and improvement plans as provided by the user. Use this to track critical security, mobile, performance, desktop, and polish tasks for the Photo App.

---

## 🔴 Phase 1: Critical Security & Stability (Do Immediately)
*Fixes that prevent data loss, security breaches, and core functionality failures.*

- [ ] **Fix "Split-Brain" Auth:** Remove/retire remaining legacy cookie auth paths (images/E2E) so auth is consistently Bearer-token based where feasible.
- [ ] **Fix "Trojan Horse" Uploads:** Validate file types by checking "Magic Numbers" (hex signatures), not just file extensions/MIME types.
- [ ] **Fix "Mobile Gallery" Trap:** Add `accept="image/*"` to file inputs so mobile users get the Camera Roll instead of the Files app.
- [ ] **Implement "Wallet Drainer" Protection:** Add Rate Limiting to the `/upload` endpoint to prevent attackers from bankrupting storage costs.
- [ ] **Patch "TMI" Error Leaks:** Stop sending raw Database SQL error messages to the client (Security Risk).
- [ ] **Prevent "ID Enumeration":** Plan migration from Integer IDs (`/photos/500`) to UUIDs to prevent scraping.
- [ ] **Fix "Broken Link" Deletes:** Delete the Database record *before* the Storage file (or use a transaction) to prevent "ghost" images.
- [ ] **Fix "Self-Denial" Limit:** Increase `express.json` limit for the "Save Edit" route or switch to `multipart/form-data` to allow saving edits.
- [ ] **Fix "Race Condition" in Collectibles:** Use SQL `ON CONFLICT` (Upsert) instead of "Check-then-Insert" logic.
- [ ] **Create ADR Policy:** Add `docs/ADR_POLICY.md` (does not exist yet) or remove this item if ADRs won’t be used.

## 🟠 Phase 2: High Priority Mobile Fixes & Crash Prevention
*Fixes that stop the app from looking broken on phones or crashing under load.*

- [ ] **Fix "Off-Screen" Mobile Menu:** Remove fixed widths in `AppHeader.jsx` and hide text labels on mobile.
- [ ] **Fix Mobile Grid Density:** Change gallery from 1-column to **3-columns** on mobile for a standard app feel.
- [ ] **Fix "Fat Finger" Targets:** Increase touch targets for buttons (Sign Out, Upload) to minimum 44x44px.
- [ ] **Fix "Boomerang" Upload:** Stop downloading files back to the server for EXIF data; extract EXIF on the client before upload.
- [ ] **Prevent "Event Loop Blocker":** Stop converting large Base64 strings synchronously; block the Node.js event loop.
- [ ] **Fix "Infinity Scroll" Crash:** Implement pagination (cursor-based) for `listPhotos` to prevent loading 5,000 rows at once.
- [ ] **Fix "Poison Pill" JSON:** Wrap `JSON.parse` in a try/catch block inside the list loop to prevent one bad photo from crashing the whole gallery.
- [ ] **Fix "Memory Amnesia":** Move Rate Limiter storage from RAM to Redis so it persists across restarts.
- [ ] **Fix "Zombie" Process:** Ensure `process.exit(1)` is called on unhandled exceptions to allow Docker/Railway to restart the clean state.
- [ ] **Fix "Silent Drop" Queues:** Implement an Outbox pattern for AI jobs so tasks aren't lost if Redis is down.

## 🟡 Phase 3: Performance & "Native" Feel
*Fixes that make the app feel fast and professional.*

- [ ] **Implement Client-Side Compression:** Resize images to ~2048px in browser before uploading (Speed up uploads by 10x).
- [ ] **Implement "Optimistic UI":** Show local preview of photos immediately when selected, don't wait for server response.
- [ ] **Add Skeleton Screens:** Replace spinning loaders with pulsing gray skeletons for perceived performance.
- [ ] **Implement Virtualization:** Use `react-window` for the gallery to prevent DOM freezing with large photo libraries.
- [ ] **Fix "Data Gluttony":** Stop using `SELECT *`; only fetch columns needed for the view.
- [ ] **Fix "Memory Bomb" Script:** Refactor maintenance scripts to use Streams instead of loading all rows into arrays.
- [ ] **Decouple "Distributed Cron":** Move `setInterval` tasks out of the web server and into a dedicated Worker process.
- [ ] **Switch to Signed URLs:** Stop proxying images through Node.js; generate temporary direct links to Supabase Storage.
- [ ] **Fix "Waterfall" Loading:** Move data fetching from Component `useEffect` to Router Loaders.
- [ ] **Add PWA Manifest:** Create `manifest.json` to allow "Add to Home Screen" and remove the browser URL bar.
- [ ] **Tiny Thumbnails:** Generate specific 150px thumbnails for mobile views to save bandwidth.

## 🔵 Phase 4: Desktop Features & Code Hygiene
*Fixes for "Pro" users and long-term maintenance.*

- [ ] **Add Drag & Drop Upload:** Allow desktop users to drag files directly onto the form.
- [ ] **Enable Directory Uploads:** Add `webkitdirectory` support for uploading full folders.
- [ ] **Add Keyboard Shortcuts:** Arrow keys for nav, Escape to close, Delete to trash.
- [ ] **Implement Shift-Click Select:** Allow selecting ranges of photos.
- [ ] **Add Right-Click Context Menus:** Custom menu for "Download", "Delete", "Edit".
- [ ] **Fix "Roulette Wheel" Build:** Change CI/Prod build command to `npm ci` instead of `npm install`.
- [ ] **Reduce Production Bloat:** Remove `devDependencies` from the production Docker image.
- [ ] **Add Request IDs:** Add UUIDs to logs to trace requests across the system.
- [ ] **Remove "Magic Strings":** Extract status strings (`'working'`, `'USD'`) to a constants file.
- [ ] **Standardize API Routes:** Move all routes under `/api/v1/` for versioning control.
- [ ] **Fix "Time Bomb" Certs:** Remove hardcoded SSL paths; load CA certs via Environment Variables.
- [ ] **Refactor "Fat Controller":** Move logic from `uploads.js` into a `UploadService`.
- [ ] **Fix "Rude Hangup":** Implement Graceful Shutdown to handle `SIGTERM` signals correctly.

## ⚪ Phase 5: Polish & Nice-to-Haves
*The cherry on top.*

- [ ] **Add Mobile Gestures:** Swipe left/right for nav, swipe down to close lightbox.
- [ ] **Add Pull-to-Refresh:** Standard mobile gesture to reload gallery.
- [ ] **Add Bottom Sheets:** Replace `alert()` with mobile-friendly bottom drawers.
- [ ] **Add Haptic Feedback:** Use `navigator.vibrate` for tactile response on buttons.
- [ ] **Add Toast Notifications:** Replace blocking success popups with auto-dismissing toasts.
- [ ] **Add Hover Micro-interactions:** subtle zoom/shadow on desktop hover.
- [ ] **Add Drag Reordering:** Allow users to manually sort photos in the grid.
- [ ] **Add Background Upload Warning:** Warn users if they try to close the tab while uploading.
- [ ] **Fix "Phantom Query":** Ensure Database queries are actually cancelled when the API times out.
- [ ] **Switch to TypeScript:** (Long term) Rewrite files to `.ts` for type safety.
