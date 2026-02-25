# Chess Hub Desktop Layout Notes

## Responsive branch behavior

- `src/pages/ChessHub.tsx` uses a viewport check at `min-width: 1024px`.
- `<1024px`: renders `ChessHubMobile` (existing mobile UI preserved).
- `>=1024px`: renders `ChessHubDesktopLayout` with:
  - `SocialHubCard`
  - `GreatestGamesCard`
  - Desktop action-zone cards and continue/recent panels.

## Desktop scroll strategy

- Desktop uses a flex column page shell (`h-dvh`) with a fixed `h-14` header and a `flex-1 min-h-0` content area.
- The page container is `overflow-hidden` on desktop so the browser page does not double-scroll.
- Inner panels own their scrolling:
  - left-column list areas scroll internally as needed,
  - right rail second row wraps `GreatestGamesCard` in a `min-h-0 overflow-y-auto` region.
- This prevents clipping of the lower replay content and keeps local (`dev`) + production (`build/preview`) behavior aligned.

## Responsive board sizing

- `GreatestGamesCard` now sizes the board from available container width using `useClampedElementWidth`.
- Width is clamped to a readable range (`280` to `460`) and updated via `ResizeObserver` with `requestAnimationFrame` scheduling.
- This keeps the board legible on narrower desktop widths while using more space on wider displays without layout jank.

## Replay tuning

- Replay data is in `src/pages/GreatestGamesCard.tsx` as `replayPlies`.
- Replay speed is controlled by the timeout in the autoplay effect (`2000` ms per ply).
- Reduced motion behavior is controlled by `useReducedMotion()`:
  - reduce motion enabled: autoplay starts paused.
  - reduce motion disabled: autoplay starts automatically.

## Move list edits

- Keep SAN values in `replayPlies` clean (no `!!`, `?!`, `!`, `?` suffixes).
- Store annotations in the `comment` field per ply.
- Preserve sequential `ply` numbering to keep scrubber and comment display aligned.