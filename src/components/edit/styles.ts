/**
 * Shared inline styles for EditPage components
 * Extracted to maintain consistency and avoid duplication
 * Values preserved exactly from original EditPage.tsx
 */

export const editPageStyles = {
  // Outer overlay container
  fixedOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    backgroundColor: '#cbd5e1', // slate-300
    display: 'flex',
    flexDirection: 'column' as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },

  // Main white card container
  mainCard: {
    flex: 1,
    margin: '16px',
    marginTop: '68px', // Account for fixed 52px AppHeader + 16px spacing
    backgroundColor: 'white',
    borderRadius: '24px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    position: 'relative' as const,
  },

  // Header actions container
  headerActionsContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  // Processing badge
  processingBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: '#fef3c7',
    color: '#d97706',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 500,
    border: '1px solid #fde68a',
  },

  // Recheck AI button
  recheckButton: (disabled: boolean) => ({
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: disabled ? '#cbd5e1' : '#475569',
    fontSize: '12px',
    fontWeight: 500,
    transition: 'all 0.15s ease',
  }),

  // Save button
  saveButton: (saving: boolean) => ({
    backgroundColor: '#0f172a',
    color: 'white',
    fontSize: '12px',
    fontWeight: 500,
    padding: '6px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: saving ? 'wait' : 'pointer',
    opacity: saving ? 0.7 : 1,
    transition: 'all 0.15s ease',
  }),

  // Tab navigation container
  tabNavContainer: {
    display: 'flex',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    flexShrink: 0,
  },

  // Tab button
  tabButton: (isActive: boolean) => ({
    flex: 1,
    padding: '12px 16px',
    fontSize: '13px',
    fontWeight: isActive ? 600 : 500,
    color: isActive ? '#1e293b' : '#64748b',
    backgroundColor: isActive ? '#ffffff' : 'transparent',
    border: 'none',
    borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }),

  // Collectible indicator badge
  collectibleIndicator: {
    position: 'absolute' as const,
    top: '8px',
    right: '8px',
    width: '8px',
    height: '8px',
    backgroundColor: '#f59e0b',
    borderRadius: '50%',
  },

  // Story tab container
  storyTabContainer: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
  },

  // Story tab inner wrapper
  storyTabInner: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
  },

  // Story tab label
  storyTabLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '12px',
  },

  // Story textarea
  storyTextarea: {
    flex: 1,
    width: '100%',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    padding: '16px',
    fontSize: '15px',
    lineHeight: '1.6',
    color: '#334155',
    outline: 'none',
    resize: 'none' as const,
    minHeight: '200px',
  },

  // Location tab container
  locationTabContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: '20px',
  },

  // Location map wrapper
  locationMapWrapper: {
    height: '100%',
    width: '100%',
    borderRadius: '16px',
    overflow: 'hidden',
    border: '1px solid rgba(226, 232, 240, 0.6)',
    position: 'relative' as const,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  },

  // Photo stack (left column) container
  photoStackContainer: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    borderRight: '1px solid #e2e8f0',
    padding: '20px',
  },

  // Caption input
  captionInput: {
    width: '100%',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '8px 4px',
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#1e293b',
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s ease',
  },

  // Flip card container
  flipCardContainer: {
    flex: 1,
    minHeight: 0,
    position: 'relative' as const,
  },

  // Photo canvas container
  photoCanvasContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0f172a',
    position: 'relative' as const,
  },

  // Loading overlay
  loadingOverlay: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
  },

  // Error overlay
  errorOverlay: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ef4444',
    gap: '8px',
  },

  // Retry button
  retryButton: {
    padding: '4px 12px',
    backgroundColor: 'white',
    border: '1px solid #ef4444',
    borderRadius: '4px',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '12px',
  },

  // Right column container
  rightColumnContainer: {
    flex: 1,
    backgroundColor: 'white',
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
  },

  // Tab content container
  tabContentContainer: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
};
