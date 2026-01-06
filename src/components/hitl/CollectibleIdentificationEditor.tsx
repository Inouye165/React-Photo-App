import React, { useState } from 'react';

export interface CollectibleOverride {
  id: string;
  category: string;
  confirmedBy?: string;
  fields?: Record<string, string>;
}

interface CollectibleIdentificationEditorProps {
  initialData?: {
    id?: string;
    category?: string;
    name?: string;
  };
  onSave: (override: CollectibleOverride) => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

/**
 * CollectibleIdentificationEditor
 * Minimal focused form for editing collectible identification
 * Validates required fields (id + category) before allowing save
 */
export default function CollectibleIdentificationEditor({
  initialData,
  onSave,
  onCancel,
  isProcessing = false,
}: CollectibleIdentificationEditorProps) {
  const [id, setId] = useState(initialData?.id || '');
  const [category, setCategory] = useState(initialData?.category || '');
  const [name, setName] = useState(initialData?.name || '');

  const isValid = id.trim().length > 0 && category.trim().length > 0;

  const handleSave = () => {
    if (!isValid || isProcessing) return;

    const override: CollectibleOverride = {
      id: id.trim(),
      category: category.trim(),
      confirmedBy: 'human',
      fields: {
        name: name.trim() || id.trim(),
      },
    };

    onSave(override);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValid && !isProcessing) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="collectible-id" className="block text-sm font-medium text-slate-700 mb-1">
          ID <span className="text-red-500">*</span>
        </label>
        <input
          id="collectible-id"
          type="text"
          value={id}
          onChange={(e) => setId(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          placeholder="e.g., SKU, catalog number"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
        />
      </div>

      <div>
        <label htmlFor="collectible-category" className="block text-sm font-medium text-slate-700 mb-1">
          Category <span className="text-red-500">*</span>
        </label>
        <input
          id="collectible-category"
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          placeholder="e.g., stamp, coin, card"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
        />
      </div>

      <div>
        <label htmlFor="collectible-name" className="block text-sm font-medium text-slate-700 mb-1">
          Name (Optional)
        </label>
        <input
          id="collectible-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          placeholder="e.g., description or title"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
        />
      </div>

      <div className="flex gap-3 justify-end pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isValid || isProcessing}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
