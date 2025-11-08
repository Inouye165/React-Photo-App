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
  const originalAI = useRef({ caption: null, description: null, keywords: null });

  useEffect(() => {
    if (!pollingPhotoId) return;
    addPollingId(pollingPhotoId);
    let cancelled = false;
    attemptsRef.current = 0;
    const MAX_ATTEMPTS = 40;

    // Fetch the initial photo state to compare with future AI values
    (async () => {
      try {
        const res = await getPhoto(pollingPhotoId, { cacheBuster: Date.now() });
        let base = res && res.photo ? res.photo : res;
        if (base) {
          originalAI.current = {
            caption: base.caption || '',
            description: base.description || '',
            keywords: base.keywords || '',
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
      
      // Check if AI processing failed permanently
      const failedMarker = 'ai processing failed';
      if (c.toLowerCase() === failedMarker || d.toLowerCase() === failedMarker) {
        return true; // Stop polling - AI failed
      }
      
      return (
        (!!c && c !== originalAI.current.caption) ||
        (!!d && d !== originalAI.current.description) ||
        (!!k && k !== originalAI.current.keywords)
      );
    };

    const pollForUpdate = async () => {
      attemptsRef.current += 1;
      try {
        const res = await getPhoto(pollingPhotoId, { cacheBuster: Date.now() });
        let updated = res && res.photo ? res.photo : res;
        if (hasNewAIdata(updated)) {
          if (cancelled) return;
          updatePhoto(updated);
          removePollingId(updated.id);
          setPollingPhotoId(null);
          
          // Check if AI processing failed
          const failedMarker = 'ai processing failed';
          const caption = (updated.caption || '').toString().toLowerCase();
          const description = (updated.description || '').toString().toLowerCase();
          if (caption === failedMarker || description === failedMarker) {
            // toast removed: AI processing failed
          }
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
