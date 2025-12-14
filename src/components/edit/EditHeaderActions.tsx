import { editPageStyles } from './styles';

interface EditHeaderActionsProps {
  isPolling: boolean;
  recheckingAI: boolean;
  aiReady: boolean;
  saving: boolean;
  onRecheckClick: () => void;
  onSaveClick: () => void;
}

/**
 * EditHeaderActions - Header actions for EditPage
 * Contains AI Recheck button/badge and Save Changes button
 */
export default function EditHeaderActions({
  isPolling,
  recheckingAI,
  aiReady,
  saving,
  onRecheckClick,
  onSaveClick,
}: EditHeaderActionsProps) {
  return (
    <div style={editPageStyles.headerActionsContainer}>
      {/* AI Recheck Status */}
      {isPolling || recheckingAI ? (
        <div style={editPageStyles.processingBadge}>
          <span>Processing...</span>
        </div>
      ) : (
        <button
          onClick={onRecheckClick}
          disabled={!aiReady}
          style={editPageStyles.recheckButton(!aiReady)}
        >
          Recheck AI
        </button>
      )}

      {/* Save Button */}
      <button 
        onClick={onSaveClick} 
        disabled={saving}
        style={editPageStyles.saveButton(saving)}
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}
