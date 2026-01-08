import React, { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../contexts/AuthContext';
import type { Photo } from '../types/photo';
import type { CollectibleFormState, CollectibleRecord, CollectibleSpecifics } from '../types/collectibles';

type PhotoId = Photo['id'];

type CategorySpecificFieldType = 'text' | 'number';

type CategorySpecificField = {
  key: string;
  label: string;
  type: CategorySpecificFieldType;
  placeholder: string;
};

/**
 * Category-specific fields configuration
 * Maps category names to their specific form fields
 */
const CATEGORY_SPECIFICS: Record<string, CategorySpecificField[]> = {
  'Comic Book': [
    { key: 'publisher', label: 'Publisher', type: 'text', placeholder: 'e.g., Marvel, DC Comics' },
    { key: 'issueNumber', label: 'Issue #', type: 'text', placeholder: 'e.g., #1, #142' },
    { key: 'year', label: 'Year', type: 'number', placeholder: 'e.g., 1963' },
  ],
  Kitchenware: [
    { key: 'pattern', label: 'Pattern', type: 'text', placeholder: 'e.g., Butterprint, Gooseberry' },
    { key: 'pieceType', label: 'Piece Type', type: 'text', placeholder: 'e.g., Mixing Bowl, Casserole' },
  ],
  'Trading Cards': [
    { key: 'set', label: 'Set/Series', type: 'text', placeholder: 'e.g., 1986 Fleer' },
    { key: 'cardNumber', label: 'Card #', type: 'text', placeholder: 'e.g., #57' },
    { key: 'player', label: 'Player/Subject', type: 'text', placeholder: 'e.g., Michael Jordan' },
  ],
  Coins: [
    { key: 'denomination', label: 'Denomination', type: 'text', placeholder: 'e.g., Quarter, Penny' },
    { key: 'year', label: 'Year', type: 'number', placeholder: 'e.g., 1964' },
    { key: 'mint', label: 'Mint Mark', type: 'text', placeholder: 'e.g., D, S, P' },
  ],
  Toys: [
    { key: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g., Hasbro, Mattel' },
    { key: 'line', label: 'Product Line', type: 'text', placeholder: 'e.g., Star Wars, G.I. Joe' },
    { key: 'year', label: 'Year', type: 'number', placeholder: 'e.g., 1985' },
  ],
};

type Grade = { label: string; rank: number; definition: string };

/**
 * Default generic grading scale (fallback when user has no custom scales)
 */
const DEFAULT_GRADING_SCALE: Grade[] = [
  { label: 'Mint', rank: 5, definition: 'Perfect condition, no flaws' },
  { label: 'Excellent', rank: 4, definition: 'Near perfect with minimal wear' },
  { label: 'Good', rank: 3, definition: 'Normal wear, no major damage' },
  { label: 'Fair', rank: 2, definition: 'Noticeable wear or minor damage' },
  { label: 'Poor', rank: 1, definition: 'Significant damage or heavy wear' },
];

/**
 * Available collectible categories
 */
const CATEGORIES = ['Comic Book', 'Kitchenware', 'Trading Cards', 'Coins', 'Toys', 'Other'] as const;

/**
 * Confidence threshold constants
 */
const CONFIDENCE_HIGH = 0.9;
const CONFIDENCE_REVIEW = 0.8;

type ConfidenceLevel = 'high' | 'review' | 'low';

/**
 * Determines if a field should be pre-filled based on AI confidence
 * @param confidence - AI confidence score (0-1)
 */
function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= CONFIDENCE_HIGH) return 'high';
  if (confidence >= CONFIDENCE_REVIEW) return 'review';
  return 'low';
}

function isGrade(value: unknown): value is Grade {
  if (!value || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.label === 'string' && typeof rec.rank === 'number' && typeof rec.definition === 'string';
}

function normalizeSpecifics(input: unknown): CollectibleSpecifics {
  if (!input || typeof input !== 'object') return {};
  const rec = input as Record<string, unknown>;
  const out: CollectibleSpecifics = {};
  for (const [key, value] of Object.entries(rec)) {
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    // Ignore nested objects/arrays for form inputs.
  }
  return out;
}

type CollectibleEditorAiAnalysis = {
  name?: unknown;
  nameConfidence?: unknown;
  category?: unknown;
  categoryConfidence?: unknown;
  conditionLabel?: unknown;
  conditionConfidence?: unknown;
  valueMin?: unknown;
  valueMax?: unknown;
  valueConfidence?: unknown;
  specifics?: unknown;
  specificsConfidence?: unknown;
  [key: string]: unknown;
};

type CollectibleEditorInitialData = CollectibleRecord & {
  condition_label?: string;
  value_min?: number | string | null;
  value_max?: number | string | null;
};

export type CollectibleFormStateWithPhotoId = CollectibleFormState & { photoId: PhotoId };

export interface CollectibleEditorPanelProps {
  photoId: PhotoId;
  aiAnalysis?: CollectibleEditorAiAnalysis | null;
  initialData?: CollectibleEditorInitialData | null;
  onChange?: (formState: CollectibleFormStateWithPhotoId) => void;
  onSave?: (formState: CollectibleFormStateWithPhotoId) => void;
}

/**
 * CollectibleEditorPanel - AI-Augmented Data Entry Form for Collectibles
 *
 * Features:
 * - Dynamic category-specific fields
 * - Confidence-based UI (pre-fill vs placeholder based on AI confidence)
 * - User-defined grading scales from preferences
 * - Controlled form state management
 */
export default function CollectibleEditorPanel({
  photoId,
  aiAnalysis = null,
  initialData = null,
  onChange,
  onSave,
}: CollectibleEditorPanelProps) {
  // Get user preferences for grading scales
  const { preferences } = useAuth();

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [conditionLabel, setConditionLabel] = useState('');
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [specifics, setSpecifics] = useState<CollectibleSpecifics>({});

  // Get available grading scale for selected category
  const availableGrades = useMemo<Grade[]>(() => {
    if (!category) return DEFAULT_GRADING_SCALE;

    const gradingScales = preferences?.gradingScales;
    if (!gradingScales || typeof gradingScales !== 'object') return DEFAULT_GRADING_SCALE;

    const forCategory = (gradingScales as Record<string, unknown>)[category];
    if (!Array.isArray(forCategory)) return DEFAULT_GRADING_SCALE;

    const asGrades = forCategory.filter(isGrade);
    return asGrades.length > 0 ? asGrades : DEFAULT_GRADING_SCALE;
  }, [category, preferences?.gradingScales]);

  // Get category-specific fields
  const categoryFields = useMemo<CategorySpecificField[]>(() => {
    return CATEGORY_SPECIFICS[category] || [];
  }, [category]);

  // Initialize form from initialData
  useEffect(() => {
    if (!initialData) return;

    setName(typeof initialData.name === 'string' ? initialData.name : '');
    setCategory(typeof initialData.category === 'string' ? initialData.category : '');

    const label =
      (typeof initialData.condition_label === 'string' && initialData.condition_label) ||
      (typeof initialData.conditionLabel === 'string' && initialData.conditionLabel) ||
      '';
    setConditionLabel(label);

    const minRaw = initialData.value_min ?? initialData.valueMin;
    const maxRaw = initialData.value_max ?? initialData.valueMax;

    setValueMin(minRaw == null ? '' : String(minRaw));
    setValueMax(maxRaw == null ? '' : String(maxRaw));

    setSpecifics(normalizeSpecifics(initialData.specifics));
  }, [initialData]);

  // Apply AI suggestions based on confidence levels
  useEffect(() => {
    if (!aiAnalysis) return;

    const applyAiStringValue = (
      aiValue: unknown,
      aiConfidence: unknown,
      setter: React.Dispatch<React.SetStateAction<string>>,
      currentValue: string,
    ) => {
      if (typeof aiValue !== 'string' || aiValue.length === 0) return;
      if (typeof aiConfidence !== 'number') return;
      const level = getConfidenceLevel(aiConfidence);
      if ((level === 'high' || level === 'review') && !currentValue) {
        setter(aiValue);
      }
    };

    const applyAiNumberishValue = (
      aiValue: unknown,
      aiConfidence: unknown,
      setter: React.Dispatch<React.SetStateAction<string>>,
      currentValue: string,
    ) => {
      if (aiValue == null) return;
      if (typeof aiConfidence !== 'number') return;
      const level = getConfidenceLevel(aiConfidence);
      if ((level === 'high' || level === 'review') && !currentValue) {
        setter(String(aiValue));
      }
    };

    applyAiStringValue(aiAnalysis.name, aiAnalysis.nameConfidence, setName, name);
    applyAiStringValue(aiAnalysis.category, aiAnalysis.categoryConfidence, setCategory, category);
    applyAiStringValue(aiAnalysis.conditionLabel, aiAnalysis.conditionConfidence, setConditionLabel, conditionLabel);

    applyAiNumberishValue(aiAnalysis.valueMin, aiAnalysis.valueConfidence, setValueMin, valueMin);
    applyAiNumberishValue(aiAnalysis.valueMax, aiAnalysis.valueConfidence, setValueMax, valueMax);

    // Apply specifics
    if (aiAnalysis.specifics) {
      const confidence = typeof aiAnalysis.specificsConfidence === 'number' ? aiAnalysis.specificsConfidence : 0;
      const level = getConfidenceLevel(confidence);
      if (level === 'high' || level === 'review') {
        const normalized = normalizeSpecifics(aiAnalysis.specifics);
        setSpecifics((prev) => ({ ...normalized, ...prev }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiAnalysis]);

  const formState = useMemo<CollectibleFormStateWithPhotoId>(() => {
    return {
      photoId,
      name,
      category,
      conditionLabel,
      valueMin: valueMin ? Number(valueMin) : undefined,
      valueMax: valueMax ? Number(valueMax) : undefined,
      specifics,
    };
  }, [photoId, name, category, conditionLabel, valueMin, valueMax, specifics]);

  // Notify parent of form state changes
  useEffect(() => {
    if (!onChange) return;
    onChange(formState);
  }, [formState, onChange]);

  // Handle category change - reset condition and specifics
  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    setConditionLabel('');
    setSpecifics({});
  };

  // Handle specifics field change
  const handleSpecificsChange = (key: string, value: string) => {
    setSpecifics((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Get confidence style classes
  const getConfidenceClass = (fieldName: string) => {
    if (!aiAnalysis) return '';
    const confidenceKey = `${fieldName}Confidence`;
    const confidence = aiAnalysis[confidenceKey];
    if (typeof confidence !== 'number') return '';

    const level = getConfidenceLevel(confidence);
    if (level === 'review') return 'confidence-review';
    return '';
  };

  // Get placeholder text for low-confidence AI suggestions
  const getAiPlaceholder = (fieldName: string, defaultPlaceholder: string) => {
    if (!aiAnalysis) return defaultPlaceholder;

    const aiValue = aiAnalysis[fieldName];

    // Value fields share a single confidence score
    const confidenceKey = fieldName === 'valueMin' || fieldName === 'valueMax' ? 'valueConfidence' : `${fieldName}Confidence`;
    const confidence = aiAnalysis[confidenceKey];

    if (aiValue !== undefined && aiValue !== null && typeof confidence === 'number' && getConfidenceLevel(confidence) === 'low') {
      return `AI Suggestion: ${String(aiValue)}`;
    }

    return defaultPlaceholder;
  };

  // Check if field should be empty (low confidence)
  const shouldBeEmpty = (fieldName: string) => {
    if (!aiAnalysis) return false;
    const confidenceKey = `${fieldName}Confidence`;
    const confidence = aiAnalysis[confidenceKey];
    return typeof confidence === 'number' && getConfidenceLevel(confidence) === 'low';
  };

  // Get value for a field, respecting confidence rules
  const getFieldValue = (fieldName: string, stateValue: string) => {
    // If user has modified the value, always show it
    if (stateValue !== '') return stateValue;

    // If AI confidence is low, return empty string (show placeholder instead)
    if (shouldBeEmpty(fieldName)) return '';

    return stateValue;
  };

  const handleSave = () => {
    if (!onSave) return;
    onSave(formState);
  };

  return (
    <div className="collectible-editor-panel" data-testid="collectible-editor-panel">
      <div className="panel-header">
        <h3>Collectible Details</h3>
        {aiAnalysis && (
          <span className="ai-badge" data-testid="ai-badge">
            AI Assisted
          </span>
        )}
      </div>

      <div className="form-grid">
        {/* Name Field */}
        <div className="form-group">
          <label htmlFor="collectible-name">Name</label>
          <input
            id="collectible-name"
            data-testid="input-name"
            type="text"
            value={getFieldValue('name', name)}
            onChange={(e) => setName(e.target.value)}
            placeholder={getAiPlaceholder('name', 'Item name')}
            className={getConfidenceClass('name')}
          />
        </div>

        {/* Category Select */}
        <div className="form-group">
          <label htmlFor="collectible-category">Category</label>
          <select
            id="collectible-category"
            data-testid="select-category"
            value={getFieldValue('category', category)}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className={getConfidenceClass('category')}
          >
            <option value="">Select category...</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Condition Select - Dynamic based on category */}
        <div className="form-group">
          <label htmlFor="collectible-condition">Condition</label>
          <select
            id="collectible-condition"
            data-testid="select-condition"
            value={getFieldValue('conditionLabel', conditionLabel)}
            onChange={(e) => setConditionLabel(e.target.value)}
            className={getConfidenceClass('conditionLabel')}
          >
            <option value="">Select condition...</option>
            {availableGrades.map((grade) => (
              <option key={grade.label} value={grade.label}>
                {grade.label} ({grade.rank}/5)
              </option>
            ))}
          </select>
          {conditionLabel && availableGrades.find((g) => g.label === conditionLabel)?.definition && (
            <p className="condition-definition" data-testid="condition-definition">
              {availableGrades.find((g) => g.label === conditionLabel)?.definition}
            </p>
          )}
        </div>

        {/* Value Range */}
        <div className="form-group value-range">
          <label>Estimated Value (USD)</label>
          <div className="value-inputs">
            <input
              id="collectible-value-min"
              data-testid="input-value-min"
              type="number"
              min="0"
              step="0.01"
              value={getFieldValue('valueMin', valueMin)}
              onChange={(e) => setValueMin(e.target.value)}
              placeholder={getAiPlaceholder('valueMin', 'Min')}
              className={getConfidenceClass('value')}
            />
            <span className="value-separator">to</span>
            <input
              id="collectible-value-max"
              data-testid="input-value-max"
              type="number"
              min="0"
              step="0.01"
              value={getFieldValue('valueMax', valueMax)}
              onChange={(e) => setValueMax(e.target.value)}
              placeholder={getAiPlaceholder('valueMax', 'Max')}
              className={getConfidenceClass('value')}
            />
          </div>
        </div>

        {/* Dynamic Category-Specific Fields */}
        {categoryFields.length > 0 && (
          <div className="specifics-section" data-testid="specifics-section">
            <h4>Category Details</h4>
            {categoryFields.map((field) => (
              <div className="form-group" key={field.key}>
                <label htmlFor={`specific-${field.key}`}>{field.label}</label>
                <input
                  id={`specific-${field.key}`}
                  data-testid={`input-${field.key}`}
                  type={field.type}
                  value={typeof specifics[field.key] === 'string' || typeof specifics[field.key] === 'number' ? String(specifics[field.key]) : ''}
                  onChange={(e) => handleSpecificsChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save Button (optional, can be controlled by parent) */}
      {onSave && (
        <div className="form-actions">
          <button type="button" onClick={handleSave} className="save-button" data-testid="save-collectible-btn">
            Save Collectible
          </button>
        </div>
      )}
    </div>
  );
}
