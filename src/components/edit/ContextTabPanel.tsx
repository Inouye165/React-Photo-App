import type { Photo } from '../../types/photo';
import styles from './ContextTabPanel.module.css';
import StoryTabPanel from './StoryTabPanel';
import LocationTabPanel from './LocationTabPanel';

interface ContextTabPanelProps {
  description: string;
  onDescriptionChange: (value: string) => void;
  photo: Photo;
}

/**
 * ContextTabPanel - Unified context view for EditPage
 * Combines story textarea and location map in a single panel.
 * Reuses the existing panels to preserve sizing and styling behavior.
 */
export default function ContextTabPanel({ description, onDescriptionChange, photo }: ContextTabPanelProps) {
  return (
    <div className={styles.contextTabContainer}>
      <div className={styles.storySection}>
        <StoryTabPanel
          description={description}
          onDescriptionChange={onDescriptionChange}
        />
      </div>

      <div className={styles.mapSection}>
        <LocationTabPanel photo={photo} />
      </div>
    </div>
  );
}
