## 🚀 Description
Strict TypeScript migration batch 1: convert two runtime React modals from `.jsx` to `.tsx` under `strict: true`, preserving runtime behavior and tightening event/DOM typing.

## 🛠️ Changes
- Migrate `MetadataModal` to TypeScript/TSX and add strict props typing.
- Migrate `DisclaimerModal` to TypeScript/TSX and add strict props + event typing.
- Update `PhotoGalleryPage` import to use extensionless module path.

## 📁 Files Touched
- Frontend:
  - `src/components/MetadataModal.tsx` (from `src/components/MetadataModal.jsx`)
  - `src/components/DisclaimerModal.tsx` (from `src/components/DisclaimerModal.jsx`)
  - `src/pages/PhotoGalleryPage.tsx`

## 🔍 Type Decisions (No Shortcuts)
- No `any`, no `@ts-ignore`, no `.d.ts` shims.
- Use `ReactElement` return type to avoid relying on a global `JSX` namespace.
- Explicit DOM ref and event typing (e.g., `useRef<HTMLDivElement | null>`, `KeyboardEvent`, `ChangeEvent<HTMLInputElement>`), plus safe `HTMLElement` narrowing for focus-trap logic.

## ✅ Verification
Ran locally (Windows):
- `npm run type-check`
- `npm run lint`
- `npm test` (Vitest)
- `npm run test:maintainability` (depcruise warnings are existing baseline; migrations integrity passed)
- `npm run test:e2e` (Playwright) — 29 passed

## 🔒 Scope
- No dependency changes.
- No runtime behavior changes intended; changes are typing and import hygiene only.
