# Chess Hub Desktop Layout Notes

## Responsive branch behavior

- `src/pages/ChessHub.tsx` uses a viewport check at `min-width: 1024px`.
- `<1024px`: renders `ChessHubMobile` (existing mobile UI preserved).
- `>=1024px`: renders `ChessHubDesktopLayout` with:
  - `SocialHubCard`
  - `GreatestGamesCard`
  - Desktop action-zone cards and continue/recent panels.

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