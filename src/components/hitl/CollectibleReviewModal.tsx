import { useState } from 'react';
import { AlertCircle, CheckCircle, Edit3 } from 'lucide-react';
import CollectibleIdentificationEditor, { CollectibleOverride } from './CollectibleIdentificationEditor';
import type { CollectibleAiAnalysis } from '../../types/photo';

type ViewMode = 'review' | 'edit';

interface CollectibleReviewModalProps {
  open: boolean;
  collectibleAiAnalysis?: CollectibleAiAnalysis;
  onApprove: (override: CollectibleOverride) => void;
  onEditSave: (override: CollectibleOverride) => void;
  isProcessing?: boolean;
}

/**
 * CollectibleReviewModal
 * Non-dismissable HITL modal for reviewing and confirming AI-identified collectibles
 * Shows when a photo has pending review status
 */
export default function CollectibleReviewModal({
  open,
  collectibleAiAnalysis,
  onApprove,
  onEditSave,
  isProcessing = false,
}: CollectibleReviewModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('review');

  if (!open) return null;

  const identification = collectibleAiAnalysis?.identification;
  const review = collectibleAiAnalysis?.review;

  if (!identification || review?.status !== 'pending') {
    return null;
  }

  const handleApprove = () => {
    if (isProcessing) return;

    const override: CollectibleOverride = {
      id: identification.id || '',
      category: identification.category || 'unknown',
      confirmedBy: 'human',
      fields: {
        name: (identification.fields?.name as string) || identification.id || '',
      },
    };

    onApprove(override);
  };

  const handleEditClick = () => {
    setViewMode('edit');
  };

  const handleEditSave = (override: CollectibleOverride) => {
    onEditSave(override);
  };

  const handleCancelEdit = () => {
    setViewMode('review');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden transform scale-100 flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
      >
        {/* Header */}
        <div className="relative h-24 w-full bg-gradient-to-br from-blue-600 to-blue-700 overflow-hidden shrink-0">
          <div className="absolute inset-0 bg-gradient-to-t from-blue-900/20 to-transparent" />
          <div className="absolute bottom-0 left-0 p-6 w-full">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg">
                <AlertCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight leading-none" id="review-modal-title">
                  Review Identification
                </h2>
                <p className="text-xs text-blue-200 font-medium uppercase tracking-wider mt-1">
                  Human-in-the-Loop
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-5 overflow-y-auto">
          {viewMode === 'review' ? (
            <>
              <p className="text-sm text-slate-600 leading-relaxed">
                AI has identified this collectible and needs your confirmation to proceed with the analysis pipeline.
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">ID</span>
                  <p className="text-base font-semibold text-slate-900 mt-1">{identification.id || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Category</span>
                  <p className="text-base text-slate-900 mt-1">{identification.category || 'N/A'}</p>
                </div>
                {typeof identification.fields?.name === 'string' && (
                  <div>
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Name</span>
                    <p className="text-base text-slate-900 mt-1">{identification.fields.name}</p>
                  </div>
                )}
                {identification.confidence !== undefined && (
                  <div>
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Confidence</span>
                    <p className="text-base text-slate-900 mt-1">{Math.round(identification.confidence * 100)}%</p>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <strong className="font-semibold">Action Required:</strong> Approve if correct, or click Edit to make changes.
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={handleEditClick}
                  disabled={isProcessing}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Edit3 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isProcessing}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  {isProcessing ? 'Resuming...' : 'Approve'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                Edit the collectible identification details below. All changes will be confirmed as human-verified.
              </p>
              <CollectibleIdentificationEditor
                initialData={{
                  id: identification.id,
                  category: identification.category,
                  name: (identification.fields?.name as string) || undefined,
                }}
                onSave={handleEditSave}
                onCancel={handleCancelEdit}
                isProcessing={isProcessing}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
