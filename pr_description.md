## 🚀 Description
Fixes potluck event geocoding by adding Mapbox address autocomplete/validation, removing hardcoded coordinates, and tightening map sizing in the edit context view.

## 🛠️ Changes
- Added Mapbox Geocoding v6 autocomplete with structured input, address validation, and low-confidence warnings.
- Saved potluck locations using geocoded coordinates (or address-only when no match).
- Reduced map container height to a compact max 300px in the edit context panel.
- Documented the Mapbox access token in the frontend env template.

## 📁 Files Touched
- Frontend: `src/components/chat/ChatSettingsModal.tsx`, `src/components/edit/ContextTabPanel.module.css`, `src/types/chat.ts`
- Config: `.env.example`

## ✅ Verification
- npx vitest run

## 🔒 Notes
- Requires `VITE_MAPBOX_ACCESS_TOKEN` to enable autocomplete suggestions.

---

## ♟️ Chess Hub Desktop Update

### What changed
- Converted `/chess` desktop shell to a true viewport-locked dashboard (`h-[100dvh]` + overflow-hidden) and widened the desktop container to better use large screens.
- Refactored Game of the Week into a compact two-row layout (`gotw-summary` + `gotw-board`) and removed the dead “Why it matters” UI.
- Implemented board auto-sizing with `ResizeObserver` using available board area (width/height) so the board fits without page-level scrolling.
- Added reusable `PlayerBadge` labels aligned to board top/bottom (`player-black`, `player-white`) with rating fallback `—` when rating data is absent.
- Added collapsed-by-default “About the players” content with short Byrne/Fischer bios.
- Added stable e2e selectors (`chess-hub-root`, `gotw-summary`, `gotw-board`, `player-black`, `player-white`) and expanded Playwright coverage.

### Manual verification
- Open `/chess` at 100% zoom on `1440x900` and `1920x1080`.
- Confirm no page/document vertical scrolling.
- Confirm “Why it matters” is not rendered.
- Confirm top/bottom player labels render around the board with rating placeholder `—` when no rating exists.

### Accessibility notes
- Slider has explicit visible label and `aria-label`.
- Icon-only controls keep `aria-label`.
- Interactive controls use visible `focus-visible` rings.