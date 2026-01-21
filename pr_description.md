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