/**
 * useCollectiblesForPhoto Hook
 * 
 * Encapsulates all collectibles-related state and logic for a photo.
 * Phase 2: Extracted from EditPage to reduce component responsibility.
 * 
 * Features:
 * - Fetch collectible data once per photo ID
 * - Reset state when photo changes
 * - Manage form state and view/edit modes
 * - Save collectible data (non-blocking)
 * - Compute derived values (isCollectiblePhoto, hasCollectibleData, etc.)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCollectibles, upsertCollectible } from '../api.js';
import type { Photo } from '../types/photo';
import type { CollectibleRecord, CollectibleFormState, CollectibleAiAnalysis } from '../types/collectibles';

export interface UseCollectiblesForPhotoParams {
  photo: Photo | null | undefined;
  enabled: boolean;
}

export interface UseCollectiblesForPhotoReturn {
  // State
  collectibleData: CollectibleRecord | null;
  collectibleLoading: boolean;
  collectibleViewMode: 'view' | 'edit';
  collectibleFormState: CollectibleFormState | null;
  
  // Derived values
  isCollectiblePhoto: boolean;
  hasCollectibleData: boolean;
  collectibleAiAnalysis: CollectibleAiAnalysis | null;
  showCollectiblesTab: boolean;
  
  // Handlers
  setCollectibleViewMode: (mode: 'view' | 'edit') => void;
  handleCollectibleChange: (formState: CollectibleFormState) => void;
  saveCollectible: () => Promise<CollectibleRecord | undefined>;
}

/**
 * Hook to manage collectibles data for a photo
 */
export function useCollectiblesForPhoto({
  photo,
  enabled
}: UseCollectiblesForPhotoParams): UseCollectiblesForPhotoReturn {
  const [collectibleData, setCollectibleData] = useState<CollectibleRecord | null>(null);
  const [collectibleFormState, setCollectibleFormState] = useState<CollectibleFormState | null>(null);
  const [collectibleLoading, setCollectibleLoading] = useState(false);
  const [collectibleViewMode, setCollectibleViewMode] = useState<'view' | 'edit'>('view');
  const collectibleFetchedRef = useRef(false);

  // Check if photo is classified as a collectible or has existing collectible data
  const isCollectiblePhoto = 
    photo?.classification === 'collectables' || 
    photo?.classification === 'collectible' ||
    photo?.ai_analysis?.classification === 'collectables' || 
    photo?.ai_analysis?.classification === 'collectible' ||
    false;

  const hasCollectibleData = collectibleData !== null;

  const showCollectiblesTab = enabled && (isCollectiblePhoto || hasCollectibleData);

  // Extract AI analysis for collectibles from photo data
  // poi_analysis contains the collectibles insights from the AI pipeline
  const collectibleAiAnalysis: CollectibleAiAnalysis | null = 
    photo?.poi_analysis || 
    photo?.ai_analysis?.collectibleInsights || 
    photo?.collectible_insights || 
    null;

  // Load existing collectible data when photo changes
  useEffect(() => {
    if (!enabled || !photo?.id) return;
    
    // Reset fetch flag when photo ID changes (new photo means new fetch needed)
    collectibleFetchedRef.current = false;
    
    const loadCollectibleData = async () => {
      // Check if already fetching or fetched
      if (collectibleFetchedRef.current) return;
      collectibleFetchedRef.current = true;
      
      setCollectibleLoading(true);
      try {
        const collectibles = await fetchCollectibles(photo.id);
        if (collectibles && collectibles.length > 0) {
          setCollectibleData(collectibles[0]); // Use first collectible for this photo
        } else {
          setCollectibleData(null); // Clear data if no collectibles found
        }
      } catch (err) {
        console.debug('[useCollectiblesForPhoto] No collectible data found:', (err as Error).message);
        setCollectibleData(null); // Clear data on error
      } finally {
        setCollectibleLoading(false);
      }
    };
    
    loadCollectibleData();
  }, [photo?.id, enabled]);

  // Handle collectible form state changes
  const handleCollectibleChange = useCallback((formState: CollectibleFormState) => {
    setCollectibleFormState(formState);
  }, []);

  // Save collectible data
  const saveCollectible = useCallback(async () => {
    if (!collectibleFormState || !photo?.id) return;
    
    try {
      const result = await upsertCollectible(photo.id, {
        formState: {
          category: collectibleFormState.category,
          name: collectibleFormState.name,
          conditionLabel: collectibleFormState.conditionLabel,
          valueMin: collectibleFormState.valueMin,
          valueMax: collectibleFormState.valueMax,
          specifics: collectibleFormState.specifics
        }
      }, { recordAi: true });
      
      setCollectibleData(result);
      return result;
    } catch (err) {
      console.error('[useCollectiblesForPhoto] Failed to save collectible:', err);
      throw err;
    }
  }, [collectibleFormState, photo?.id]);

  return {
    // State
    collectibleData,
    collectibleLoading,
    collectibleViewMode,
    collectibleFormState,
    
    // Derived values
    isCollectiblePhoto,
    hasCollectibleData,
    collectibleAiAnalysis,
    showCollectiblesTab,
    
    // Handlers
    setCollectibleViewMode,
    handleCollectibleChange,
    saveCollectible,
  };
}
