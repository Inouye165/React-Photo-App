import { editPageStyles } from './styles';

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
 */
export default function EditTabs({
  activeTab,
  onTabChange,
  showCollectiblesTab,
  isCollectiblePhoto,
  hasCollectibleData,
}: EditTabsProps) {
  return (
    <div style={editPageStyles.tabNavContainer}>
      <button
        onClick={() => onTabChange('story')}
        style={editPageStyles.tabButton(activeTab === 'story')}
      >
        Story
      </button>
      <button
        onClick={() => onTabChange('location')}
        style={editPageStyles.tabButton(activeTab === 'location')}
      >
        Location
      </button>
      {showCollectiblesTab && (
        <button
          onClick={() => onTabChange('collectibles')}
          style={{
            ...editPageStyles.tabButton(activeTab === 'collectibles'),
            position: 'relative',
          }}
        >
          Collectibles
          {isCollectiblePhoto && !hasCollectibleData && (
            <span style={editPageStyles.collectibleIndicator} title="AI detected collectible" />
          )}
        </button>
      )}
    </div>
  );
}
