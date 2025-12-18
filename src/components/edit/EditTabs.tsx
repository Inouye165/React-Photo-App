import styles from './EditTabs.module.css';

type TabType = 'context' | 'collectibles';

interface EditTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  showCollectiblesTab: boolean;
  isCollectiblePhoto: boolean;
  hasCollectibleData: boolean;
}

/**
 * EditTabs - Tab navigation for EditPage
 * Renders Context and conditionally Collectibles tabs
 * Phase 5: Styles migrated to CSS Modules
 */
export default function EditTabs({
  activeTab,
  onTabChange,
  showCollectiblesTab,
  isCollectiblePhoto,
  hasCollectibleData,
}: EditTabsProps) {
  return (
    <div className={styles.tabNavContainer}>
      <button
        onClick={() => onTabChange('context')}
        className={`${styles.tabButton} ${activeTab === 'context' ? styles.active : ''}`}
      >
        Context
      </button>
      {showCollectiblesTab && (
        <button
          onClick={() => onTabChange('collectibles')}
          className={`${styles.tabButton} ${styles.tabButtonWithBadge} ${activeTab === 'collectibles' ? styles.active : ''}`}
        >
          Collectibles
          {isCollectiblePhoto && !hasCollectibleData && (
            <span className={styles.collectibleIndicator} title="AI detected collectible" />
          )}
        </button>
      )}
    </div>
  );
}
