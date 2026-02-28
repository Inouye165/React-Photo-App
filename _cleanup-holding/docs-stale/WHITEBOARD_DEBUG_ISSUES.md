# Whiteboard Debug Issues Log

Start date: 2026-01-28

## Current issues and notes
- **Browser lag from excessive logging**: Logging every inbound WebSocket message and every stroke event overwhelmed the console and slowed rendering. This was especially noticeable during continuous drawing (high-frequency events).
- **Event drops when required fields are missing**: If `boardId` or `strokeId` is absent, the client ignores the event to avoid console floods and inconsistent state.
- **Resilience to partial payloads**: Missing `x`, `y`, or `t` values default to `0` or `Date.now()` to prevent runtime failures during parsing.

## Logging changes (what was removed and why)
- **Removed**: Verbose per-message/per-stroke logging (including full payloads and coordinates) that fired on every WebSocket message. 
  - **Why**: This produced very high log volume, which caused browser lag and made the console unusable for other debugging signals.
- **Kept**: Low-frequency logs that are still useful for debugging connectivity issues:
  - `Connected` and `Disconnected` lifecycle messages.
  - `whiteboard:error` server-side error reporting only.
- **Notes**: A disabled `debugLog()` helper remains in the client to re-enable targeted logs if needed during future investigations.

## Follow-ups
- If deeper debugging is needed, re-enable `debugLog()` for short, targeted sessions and avoid logging inside high-frequency `stroke:move` handlers.