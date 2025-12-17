// Hook: intentionally a no-op.
//
// AI polling is implemented exclusively in the Zustand store (`startAiPolling`).
// Keeping polling out of hooks avoids competing pollers (store vs hook) that can
// race or stop early and leave photo.state stale until a refresh.
import { aiPollDebug } from '../utils/aiPollDebug'

export default function useAIPolling() {
  aiPollDebug('hook_useAIPolling_called', { note: 'hook_is_noop_store_is_source_of_truth' })
  return;
}
