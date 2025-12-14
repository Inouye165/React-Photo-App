import LocationMapPanel from '../LocationMapPanel';
import styles from './LocationTabPanel.module.css';
import type { Photo } from '../../types/photo';

interface LocationTabPanelProps {
  photo: Photo;
}

/**
 * LocationTabPanel - Location tab content for EditPage
 * Wraps the LocationMapPanel component
 * Phase 5: Styles migrated to CSS Modules
 */
export default function LocationTabPanel({ photo }: LocationTabPanelProps) {
  return (
    <div className={styles.locationTabContainer}>
      <div className={styles.locationMapWrapper}>
        <LocationMapPanel photo={photo} />
      </div>
    </div>
  );
}
