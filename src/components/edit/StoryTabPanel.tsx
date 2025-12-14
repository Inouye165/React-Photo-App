import { ChangeEvent } from 'react';
import { editPageStyles } from './styles';

interface StoryTabPanelProps {
  description: string;
  onDescriptionChange: (value: string) => void;
}

/**
 * StoryTabPanel - Story tab content for EditPage
 * Contains the description textarea for photo story
 */
export default function StoryTabPanel({
  description,
  onDescriptionChange,
}: StoryTabPanelProps) {
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onDescriptionChange(e.target.value);
  };

  return (
    <div 
      className="flex-1 overflow-y-auto p-6 min-h-0" 
      style={editPageStyles.storyTabContainer}
    >
      <div style={editPageStyles.storyTabInner}>
        <label style={editPageStyles.storyTabLabel}>
          Photo Story
        </label>
        <textarea
          value={description}
          onChange={handleChange}
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-700 outline-none focus:border-blue-500"
          style={editPageStyles.storyTextarea}
          placeholder="Tell the story behind this photo... What were you doing? Who was there? What made this moment special?"
        />
      </div>
    </div>
  );
}
