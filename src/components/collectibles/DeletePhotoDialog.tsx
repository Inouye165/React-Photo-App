interface DeletePhotoDialogProps {
  open: boolean;
  filename?: string | null;
  deleteSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeletePhotoDialog({
  open,
  filename,
  deleteSubmitting,
  onCancel,
  onConfirm,
}: DeletePhotoDialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Delete Photo Confirmation"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 6, 23, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '420px',
          borderRadius: '16px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          padding: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Delete Photo?</div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: '#475569' }}>This action cannot be undone.</div>
            {filename && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#94a3b8' }}>{String(filename)}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleteSubmitting}
            aria-label="Close"
            style={{
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              borderRadius: '10px',
              width: '34px',
              height: '34px',
              cursor: deleteSubmitting ? 'not-allowed' : 'pointer',
              color: '#334155',
              fontSize: '18px',
              lineHeight: '18px',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleteSubmitting}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 700,
              cursor: deleteSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleteSubmitting}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid #991b1b',
              background: deleteSubmitting ? '#fecaca' : '#ef4444',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 800,
              cursor: deleteSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            {deleteSubmitting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
