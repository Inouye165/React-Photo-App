import styles from './EditTabs.module.css';

type TabType = 'story' | 'location' | 'collectibles';

interface EditTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  showCollectiblesTab: boolean;
  isCollectiblePhoto: boolean;
  hasCollectibleData: boolean;
}

/**
 * EditTabs - Tab navigation for EditPage
 * Renders Story, Location, and conditionally Collectibles tabs
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
        onClick={() => onTabChange('story')}
        className={`${styles.tabButton} ${activeTab === 'story' ? styles.active : ''}`}
      >
        Story
      </button>
      <button
        onClick={() => onTabChange('location')}
        className={`${styles.tabButton} ${activeTab === 'location' ? styles.active : ''}`}
      >
        Location
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
