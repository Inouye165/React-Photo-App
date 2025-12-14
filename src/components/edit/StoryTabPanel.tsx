import { ChangeEvent } from 'react';
import styles from './StoryTabPanel.module.css';

interface StoryTabPanelProps {
  description: string;
  onDescriptionChange: (value: string) => void;
}

/**
 * StoryTabPanel - Story tab content for EditPage
 * Contains the description textarea for photo story
 * Phase 5: Styles migrated to CSS Modules
 */
export default function StoryTabPanel({
  description,
  onDescriptionChange,
}: StoryTabPanelProps) {
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onDescriptionChange(e.target.value);
  };

  return (
    <div className={styles.storyTabContainer}>
      <div className={styles.storyTabInner}>
        <label className={styles.storyTabLabel}>
          Photo Story
        </label>
        <textarea
          value={description}
          onChange={handleChange}
          className={styles.storyTextarea}
          placeholder="Tell the story behind this photo... What were you doing? Who was there? What made this moment special?"
        />
      </div>
    </div>
  );
}
