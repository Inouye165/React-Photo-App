## 🚀 Description
UI/UX improvements across three areas:
1) Gallery: sticky control bar (search/filter/sort/density)
2) Uploads: persistent background upload queue tray
3) Chat: responsive sidebar that becomes a mobile drawer

## 🛠️ Changes
### 🖼️ Gallery: sticky controls + density
- Add sticky control bar for search/filter/sort/density and preserve existing “pending uploads at top” behavior.
- Extend gallery grid to support density adjustments.

### ⬆️ Uploads: persistent background upload tray
- Add a minimal Zustand store slice to track background upload status across navigation.
- Add a global tray UI (collapsed pill + expandable list) with retry/clear affordances.
- Wire optimistic upload flows to update background upload status while preserving existing pending placeholders.

### 💬 Chat: mobile drawer sidebar
- On small screens, chat sidebar becomes a drawer with overlay, outside click + Escape close, and closes on room select.
- Add a mobile-only “Chats” button to open the drawer when in a room.

## 📁 Files Touched
- Gallery: `src/pages/PhotoGalleryPage.jsx`, `src/PhotoGallery.jsx`
- Uploads: `src/components/uploads/UploadTray.tsx`, `src/pages/UploadPage.tsx`, `src/hooks/useLocalPhotoPicker.ts`, `src/layouts/MainLayout.jsx`, `src/store.ts`, `src/store.backgroundUploads.test.ts`
- Chat: `src/pages/ChatPage.tsx`, `src/components/chat/ChatWindow.tsx`

## ✅ Verification
Ran locally (Windows):
- Frontend unit tests: `npm run test:run`
- Lint: `npm run lint`
- Type-check: `npm run type-check`
- Build: `npm run build`
- E2E: `npm run test:e2e` (Playwright)
- A11y subset: `npm run test:a11y`
- Bundle size: `npm run test:size`
- Server tests: `npm --prefix server test`

## 🧾 Notes / Deferred
- CI follow-up: fix server migration integrity test mock shape (`server/tests/routes.public.test.js`).
- `npm run test:stress` depends on backend tests; skipped as non-blocking for this UI PR.
- `npm run test:docker:smoke` currently errors due to ESM/CommonJS mismatch in `scripts/docker-smoke.js`.
- `npm run test:perf` requires `k6` installed on PATH.

## 🔒 Scope
- No server runtime code changes (tests only).
- No dependency changes.