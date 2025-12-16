import { useEffect, useRef } from 'react'
import useStore from '../store.js'
import { getPhoto } from '../api.js'

// Hook: poll backend for AI results when store.pollingPhotoId is set
export default function useAIPolling() {
  const pollingPhotoId = useStore(state => state.pollingPhotoId)
  // Use the dedicated updatePhoto action
  const updatePhoto = useStore(state => state.updatePhoto)
  const setPollingPhotoId = useStore(state => state.setPollingPhotoId)
  const addPollingId = useStore(state => state.addPollingId)
  const removePollingId = useStore(state => state.removePollingId)
  // setToast removed
  const attemptsRef = useRef(0)

  // Save initial AI fields so we can check for actual changes
  const originalAI = useRef({ caption: null, description: null, keywords: null, updated_at: null });

  useEffect(() => {
    if (!pollingPhotoId) return;
    addPollingId(pollingPhotoId);
    let cancelled = false;
    attemptsRef.current = 0;
    const MAX_ATTEMPTS = 40;

    // Fetch the initial photo state to compare with future AI values
    (async () => {
      try {
        const res = await getPhoto(pollingPhotoId, { cacheBust: true });
        let base = res && res.photo ? res.photo : res;
        if (base) {
          originalAI.current = {
            caption: base.caption || '',
            description: base.description || '',
            keywords: base.keywords || '',
            updated_at: base.updated_at || null,
          };
        }
      } catch (error) {
        void error;
        // ignore fetch errors here; polling will retry
      }
    })();

    const hasNewAIdata = (p) => {
      if (!p) return false;
      // Compare with captured original values
      const c = (p.caption || '').toString().trim();
      const d = (p.description || '').toString().trim();
      const k = (p.keywords || '').toString().trim();
      const u = p.updated_at || null;
      
      // Check if AI processing failed permanently
      const failedMarker = 'ai processing failed';
      if (c.toLowerCase() === failedMarker || d.toLowerCase() === failedMarker) {
        return true; // Stop polling - AI failed
      }
      
      // Check if updated_at timestamp changed (most reliable for rechecks)
      if (u && originalAI.current.updated_at && u !== originalAI.current.updated_at) {
        console.log('[useAIPolling] Detected update via timestamp change:', originalAI.current.updated_at, '->', u);
        return true;
      }
      
      return (
        (!!c && c !== originalAI.current.caption) ||
        (!!d && d !== originalAI.current.description) ||
        (!!k && k !== originalAI.current.keywords)
      );
    };

    const isTerminalState = (p) => {
      const state = p && p.state;
      return state === 'finished' || state === 'error';
    };

    const pollForUpdate = async () => {
      attemptsRef.current += 1;
      try {
        const res = await getPhoto(pollingPhotoId, { cacheBust: true });
        let updated = res && res.photo ? res.photo : res;

        // Always merge the freshest photo into the store so UI badges update
        // (including `state: 'finished'`) without requiring a full refresh.
        if (!cancelled && updated) {
          updatePhoto(updated);
        }

        // Only stop polling when the backend reports a terminal state.
        // Stopping early on “AI fields changed” can leave `state` stale.
        if (updated && (isTerminalState(updated) || hasNewAIdata(updated))) {
          // If state is still inprogress but AI fields changed, keep polling.
          if (!isTerminalState(updated)) {
            return;
          }

          if (cancelled) return;
          removePollingId(updated.id ?? pollingPhotoId);
          setPollingPhotoId(null);
          return;
        }
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          if (!cancelled) {
            removePollingId(pollingPhotoId);
            setPollingPhotoId(null);
            // toast removed: AI job still running
          }
          return;
        }
      } catch (err) {
        if (String(err?.message).includes('404')) {
          if (!cancelled) {
            removePollingId(pollingPhotoId);
            setPollingPhotoId(null);
            // toast removed: Photo not found
          }
          return;
        }
        // Ignore other errors and continue polling
      }
    };

    pollForUpdate();
    const interval = setInterval(pollForUpdate, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      removePollingId(pollingPhotoId);
    };
  }, [pollingPhotoId, updatePhoto, setPollingPhotoId, addPollingId, removePollingId]);
}
