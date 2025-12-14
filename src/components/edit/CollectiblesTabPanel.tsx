/**
 * CollectiblesTabPanel Component
 * 
 * Presentational component for the Collectibles tab in EditPage.
 * Phase 2: Extracted from EditPage to isolate collectibles UI logic.
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
}: CollectiblesTabPanelProps) {
  return (
    <div 
      className="flex-1 overflow-y-auto" 
      style={{ 
        flex: 1, 
        overflowY: 'auto', 
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* View/Edit Toggle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: '#f8fafc',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          gap: '8px',
        }}>
          <button
            onClick={() => onViewModeChange('view')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: collectibleViewMode === 'view' ? 600 : 500,
              backgroundColor: collectibleViewMode === 'view' ? '#1e293b' : 'white',
              color: collectibleViewMode === 'view' ? 'white' : '#64748b',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            📋 View Details
          </button>
          <button
            onClick={() => onViewModeChange('edit')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: collectibleViewMode === 'edit' ? 600 : 500,
              backgroundColor: collectibleViewMode === 'edit' ? '#1e293b' : 'white',
              color: collectibleViewMode === 'edit' ? 'white' : '#64748b',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            ✏️ Edit
          </button>
        </div>
        {isCollectiblePhoto && (
          <span style={{
            fontSize: '11px',
            color: '#16a34a',
            fontWeight: 500,
          }}>
            ✓ AI Detected Collectible
          </span>
        )}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {collectibleLoading ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '200px',
            color: '#64748b',
          }}>
            Loading collectible data...
          </div>
        ) : collectibleViewMode === 'view' ? (
          <CollectibleDetailView
            photo={photo}
            collectibleData={collectibleData}
            aiInsights={collectibleAiAnalysis}
          />
        ) : (
          <div style={{ padding: '16px' }}>
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
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#f1f5f9',
          fontSize: '13px',
          color: '#64748b',
          borderTop: '1px solid #e2e8f0',
          flexShrink: 0,
        }}>
          <strong>Tip:</strong> Add collectible details to track estimated values and condition. 
          This data will be saved when you click "Save Changes".
        </div>
      )}
    </div>
  );
}
