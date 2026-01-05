import styles from './EditHeaderActions.module.css';

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
 * Phase 5: Styles migrated to CSS Modules
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
    <div className={styles.headerActionsContainer}>
      {/* AI Recheck Status */}
      {isPolling || recheckingAI ? (
        <div className={styles.processingBadge}>
          <span>Processing...</span>
        </div>
      ) : (
        <button
          onClick={() => onRecheckClick()}
          disabled={!aiReady}
          className={styles.recheckButton}
        >
          Recheck AI
        </button>
      )}

      {/* Save Button */}
      <button 
        onClick={onSaveClick} 
        disabled={saving}
        className={styles.saveButton}
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}
