import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../contexts/AuthContext.jsx';

/**
 * Category-specific fields configuration
 * Maps category names to their specific form fields
 */
const CATEGORY_SPECIFICS = {
  'Comic Book': [
    { key: 'publisher', label: 'Publisher', type: 'text', placeholder: 'e.g., Marvel, DC Comics' },
    { key: 'issueNumber', label: 'Issue #', type: 'text', placeholder: 'e.g., #1, #142' },
    { key: 'year', label: 'Year', type: 'number', placeholder: 'e.g., 1963' }
  ],
  'Kitchenware': [
    { key: 'pattern', label: 'Pattern', type: 'text', placeholder: 'e.g., Butterprint, Gooseberry' },
    { key: 'pieceType', label: 'Piece Type', type: 'text', placeholder: 'e.g., Mixing Bowl, Casserole' }
  ],
  'Trading Cards': [
    { key: 'set', label: 'Set/Series', type: 'text', placeholder: 'e.g., 1986 Fleer' },
    { key: 'cardNumber', label: 'Card #', type: 'text', placeholder: 'e.g., #57' },
    { key: 'player', label: 'Player/Subject', type: 'text', placeholder: 'e.g., Michael Jordan' }
  ],
  'Coins': [
    { key: 'denomination', label: 'Denomination', type: 'text', placeholder: 'e.g., Quarter, Penny' },
    { key: 'year', label: 'Year', type: 'number', placeholder: 'e.g., 1964' },
    { key: 'mint', label: 'Mint Mark', type: 'text', placeholder: 'e.g., D, S, P' }
  ],
  'Toys': [
    { key: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g., Hasbro, Mattel' },
    { key: 'line', label: 'Product Line', type: 'text', placeholder: 'e.g., Star Wars, G.I. Joe' },
    { key: 'year', label: 'Year', type: 'number', placeholder: 'e.g., 1985' }
  ]
};

/**
 * Default generic grading scale (fallback when user has no custom scales)
 */
const DEFAULT_GRADING_SCALE = [
  { label: 'Mint', rank: 5, definition: 'Perfect condition, no flaws' },
  { label: 'Excellent', rank: 4, definition: 'Near perfect with minimal wear' },
  { label: 'Good', rank: 3, definition: 'Normal wear, no major damage' },
  { label: 'Fair', rank: 2, definition: 'Noticeable wear or minor damage' },
  { label: 'Poor', rank: 1, definition: 'Significant damage or heavy wear' }
];

/**
 * Available collectible categories
 */
const CATEGORIES = ['Comic Book', 'Kitchenware', 'Trading Cards', 'Coins', 'Toys', 'Other'];

/**
 * Confidence threshold constants
 */
const CONFIDENCE_HIGH = 0.9;
const CONFIDENCE_REVIEW = 0.8;

/**
 * Determines if a field should be pre-filled based on AI confidence
 * @param {number} confidence - AI confidence score (0-1)
 * @returns {'high' | 'review' | 'low'} Confidence level
 */
function getConfidenceLevel(confidence) {
  if (confidence >= CONFIDENCE_HIGH) return 'high';
  if (confidence >= CONFIDENCE_REVIEW) return 'review';
  return 'low';
}

/**
 * CollectibleEditorPanel - AI-Augmented Data Entry Form for Collectibles
 * 
 * Features:
 * - Dynamic category-specific fields
 * - Confidence-based UI (pre-fill vs placeholder based on AI confidence)
 * - User-defined grading scales from preferences
 * - Controlled form state management
 * 
 * @param {Object} props
 * @param {string|number} props.photoId - Required photo ID
 * @param {Object} [props.aiAnalysis] - Optional AI analysis data with confidence scores
 * @param {Object} [props.initialData] - Optional pre-existing collectible data
 * @param {Function} [props.onChange] - Callback when form state changes
 * @param {Function} [props.onSave] - Callback when save is triggered
 */
export default function CollectibleEditorPanel({ 
  photoId, 
  aiAnalysis = null, 
  initialData = null,
  onChange,
  onSave 
}) {
  // Get user preferences for grading scales
  const { preferences } = useAuth();

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [conditionLabel, setConditionLabel] = useState('');
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [specifics, setSpecifics] = useState({});

  // Get available grading scale for selected category
  const availableGrades = useMemo(() => {
    if (!category) return DEFAULT_GRADING_SCALE;
    // Use user's custom scale if available, otherwise fall back to defaults
    const gradingScales = preferences?.gradingScales || {};
    return gradingScales[category] || DEFAULT_GRADING_SCALE;
  }, [category, preferences?.gradingScales]);

  // Get category-specific fields
  const categoryFields = useMemo(() => {
    return CATEGORY_SPECIFICS[category] || [];
  }, [category]);

  // Initialize form from initialData
  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setCategory(initialData.category || '');
      setConditionLabel(initialData.condition_label || initialData.conditionLabel || '');
      setValueMin(initialData.value_min ?? initialData.valueMin ?? '');
      setValueMax(initialData.value_max ?? initialData.valueMax ?? '');
      setSpecifics(initialData.specifics || {});
    }
  }, [initialData]);

  // Apply AI suggestions based on confidence levels
  useEffect(() => {
    if (!aiAnalysis) return;

    // Helper to apply AI value based on confidence
    const applyAiValue = (aiValue, aiConfidence, setter, currentValue) => {
      if (!aiValue) return;
      const level = getConfidenceLevel(aiConfidence);
      if (level === 'high' || level === 'review') {
        // Only set if no initial/current value
        if (!currentValue) {
          setter(aiValue);
        }
      }
    };

    applyAiValue(aiAnalysis.name, aiAnalysis.nameConfidence, setName, name);
    applyAiValue(aiAnalysis.category, aiAnalysis.categoryConfidence, setCategory, category);
    applyAiValue(aiAnalysis.conditionLabel, aiAnalysis.conditionConfidence, setConditionLabel, conditionLabel);
    applyAiValue(aiAnalysis.valueMin, aiAnalysis.valueConfidence, setValueMin, valueMin);
    applyAiValue(aiAnalysis.valueMax, aiAnalysis.valueConfidence, setValueMax, valueMax);
    
    // Apply specifics
    if (aiAnalysis.specifics) {
      const level = getConfidenceLevel(aiAnalysis.specificsConfidence || 0);
      if (level === 'high' || level === 'review') {
        setSpecifics(prev => ({ ...aiAnalysis.specifics, ...prev }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiAnalysis]);

  // Notify parent of form state changes
  useEffect(() => {
    if (onChange) {
      onChange({
        photoId,
        name,
        category,
        conditionLabel,
        valueMin: valueMin ? Number(valueMin) : null,
        valueMax: valueMax ? Number(valueMax) : null,
        specifics
      });
    }
  }, [photoId, name, category, conditionLabel, valueMin, valueMax, specifics, onChange]);

  // Handle category change - reset condition and specifics
  const handleCategoryChange = (newCategory) => {
    setCategory(newCategory);
    setConditionLabel('');
    setSpecifics({});
  };

  // Handle specifics field change
  const handleSpecificsChange = (key, value) => {
    setSpecifics(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Get confidence style classes
  const getConfidenceClass = (fieldName) => {
    if (!aiAnalysis) return '';
    const confidenceKey = `${fieldName}Confidence`;
    const confidence = aiAnalysis[confidenceKey];
    if (confidence === undefined) return '';
    
    const level = getConfidenceLevel(confidence);
    if (level === 'review') return 'confidence-review';
    return '';
  };

  // Get placeholder text for low-confidence AI suggestions
  const getAiPlaceholder = (fieldName, defaultPlaceholder) => {
    if (!aiAnalysis) return defaultPlaceholder;
    
    const aiValue = aiAnalysis[fieldName];
    // Value fields share a single confidence score
    let confidenceKey = `${fieldName}Confidence`;
    if (fieldName === 'valueMin' || fieldName === 'valueMax') {
      confidenceKey = 'valueConfidence';
    }
    const confidence = aiAnalysis[confidenceKey];
    
    if (aiValue !== undefined && aiValue !== null && confidence !== undefined && getConfidenceLevel(confidence) === 'low') {
      return `AI Suggestion: ${aiValue}`;
    }
    
    return defaultPlaceholder;
  };

  // Check if field should be empty (low confidence)
  const shouldBeEmpty = (fieldName) => {
    if (!aiAnalysis) return false;
    const confidenceKey = `${fieldName}Confidence`;
    const confidence = aiAnalysis[confidenceKey];
    return confidence !== undefined && getConfidenceLevel(confidence) === 'low';
  };

  // Get value for a field, respecting confidence rules
  const getFieldValue = (fieldName, stateValue) => {
    // If user has modified the value, always show it
    if (stateValue !== undefined && stateValue !== '') return stateValue;
    
    // If AI confidence is low, return empty string (show placeholder instead)
    if (shouldBeEmpty(fieldName)) return '';
    
    return stateValue;
  };

  const handleSave = () => {
    if (onSave) {
      onSave({
        photoId,
        name,
        category,
        conditionLabel,
        valueMin: valueMin ? Number(valueMin) : null,
        valueMax: valueMax ? Number(valueMax) : null,
        specifics
      });
    }
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
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
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
            {availableGrades.map(grade => (
              <option key={grade.label} value={grade.label}>
                {grade.label} ({grade.rank}/5)
              </option>
            ))}
          </select>
          {conditionLabel && availableGrades.find(g => g.label === conditionLabel)?.definition && (
            <p className="condition-definition" data-testid="condition-definition">
              {availableGrades.find(g => g.label === conditionLabel)?.definition}
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
            {categoryFields.map(field => (
              <div className="form-group" key={field.key}>
                <label htmlFor={`specific-${field.key}`}>{field.label}</label>
                <input
                  id={`specific-${field.key}`}
                  data-testid={`input-${field.key}`}
                  type={field.type}
                  value={specifics[field.key] || ''}
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
          <button
            type="button"
            onClick={handleSave}
            className="save-button"
            data-testid="save-collectible-btn"
          >
            Save Collectible
          </button>
        </div>
      )}
    </div>
  );
}

CollectibleEditorPanel.propTypes = {
  photoId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  aiAnalysis: PropTypes.shape({
    name: PropTypes.string,
    nameConfidence: PropTypes.number,
    category: PropTypes.string,
    categoryConfidence: PropTypes.number,
    conditionLabel: PropTypes.string,
    conditionConfidence: PropTypes.number,
    valueMin: PropTypes.number,
    valueMax: PropTypes.number,
    valueConfidence: PropTypes.number,
    specifics: PropTypes.object,
    specificsConfidence: PropTypes.number
  }),
  initialData: PropTypes.shape({
    name: PropTypes.string,
    category: PropTypes.string,
    condition_label: PropTypes.string,
    conditionLabel: PropTypes.string,
    value_min: PropTypes.number,
    valueMin: PropTypes.number,
    value_max: PropTypes.number,
    valueMax: PropTypes.number,
    specifics: PropTypes.object
  }),
  onChange: PropTypes.func,
  onSave: PropTypes.func
};
