/**
 * CollectiblesTabPanel Component
 * 
 * Presentational component for the Collectibles tab in EditPage.
 * Phase 2: Extracted from EditPage to isolate collectibles UI logic.
 * Phase 5: Styles migrated to CSS Modules
 * 
 * Features:
 * - View/Edit mode toggle
 * - Loading state
 * - Renders CollectibleDetailView (view mode) or CollectibleEditorPanel (edit mode)
 * - Helper tip footer when no collectible data exists
 */

import type { Photo } from '../../types/photo';
import type { CollectibleRecord, CollectibleFormState, CollectibleAiAnalysis } from '../../types/collectibles';
import CollectibleDetailView from '../CollectibleDetailView';
import CollectibleEditorPanel from '../CollectibleEditorPanel';
import CollectiblePendingReview from '../CollectiblePendingReview';
import styles from './CollectiblesTabPanel.module.css';

export interface CollectiblesTabPanelProps {
  photo: Photo;
  collectibleData: CollectibleRecord | null;
  collectibleLoading: boolean;
  collectibleViewMode: 'view' | 'edit';
  collectibleFormState: CollectibleFormState | null;
  collectibleAiAnalysis: CollectibleAiAnalysis | null;
  isCollectiblePhoto: boolean;
  hasCollectibleData: boolean;
  onViewModeChange: (mode: 'view' | 'edit') => void;
  onCollectibleChange: (formState: CollectibleFormState) => void;
  onApproveIdentification?: () => void;
  onEditIdentification?: () => void;
}

/**
 * Collectibles tab panel - presentational component
 */
export default function CollectiblesTabPanel({
  photo,
  collectibleData,
  collectibleLoading,
  collectibleViewMode,
  isCollectiblePhoto,
  hasCollectibleData,
  collectibleAiAnalysis,
  onViewModeChange,
  onCollectibleChange,
  onApproveIdentification,
  onEditIdentification,
}: CollectiblesTabPanelProps) {
  // Check if we're in pending HITL review state
  const isPending = collectibleAiAnalysis?.review?.status === 'pending';
  const hasIdentification = collectibleAiAnalysis?.identification?.id;
  const showPendingReview = isPending && hasIdentification;

  // Show pending review UI if status is pending
  if (showPendingReview && collectibleAiAnalysis) {
    return (
      <div className={styles.container}>
        <CollectiblePendingReview
          aiAnalysis={collectibleAiAnalysis}
          onApprove={onApproveIdentification || (() => console.warn('onApproveIdentification not provided'))}
          onEdit={onEditIdentification || (() => console.warn('onEditIdentification not provided'))}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* View/Edit Toggle */}
      <div className={styles.toggleHeader}>
        <div className={styles.toggleButtons}>
          <button
            onClick={() => onViewModeChange('view')}
            className={`${styles.toggleButton} ${collectibleViewMode === 'view' ? styles.active : ''}`}
          >
            📋 View Details
          </button>
          <button
            onClick={() => onViewModeChange('edit')}
            className={`${styles.toggleButton} ${collectibleViewMode === 'edit' ? styles.active : ''}`}
          >
            ✏️ Edit
          </button>
        </div>
        {isCollectiblePhoto && (
          <span className={styles.aiDetectedBadge}>
            ✓ AI Detected Collectible
          </span>
        )}
      </div>

      {/* Content Area */}
      <div className={styles.contentArea}>
        {collectibleLoading ? (
          <div className={styles.loadingState}>
            Loading collectible data...
          </div>
        ) : collectibleViewMode === 'view' ? (
          <CollectibleDetailView
            photo={photo}
            collectibleData={collectibleData}
            aiInsights={collectibleAiAnalysis}
          />
        ) : (
          <div className={styles.editorWrapper}>
            <CollectibleEditorPanel
              photoId={photo.id}
              aiAnalysis={collectibleAiAnalysis || undefined}
              initialData={collectibleData || undefined}
              onChange={onCollectibleChange}
            />
          </div>
        )}
      </div>

      {!isCollectiblePhoto && !hasCollectibleData && (
        <div className={styles.helperTip}>
          <strong>Tip:</strong> Add collectible details to track estimated values and condition. 
          This data will be saved when you click "Save Changes".
        </div>
      )}
    </div>
  );
}
