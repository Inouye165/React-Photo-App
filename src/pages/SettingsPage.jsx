import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * SettingsPage - User preferences for collectibles grading scales
 * Route: /settings
 * 
 * Two-column layout:
 * - Left: List of categories (Comics, Pyrex, etc.)
 * - Right: Grading scale table for selected category
 * 
 * Features:
 * - Add custom grades per category
 * - Load default grading scales
 * - View/edit existing grades
 */
export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, preferences, updatePreferences, loadDefaultScales, cookieReady } = useAuth();
  
  // Selected category for right panel
  const [selectedCategory, setSelectedCategory] = useState(null);
  
  // Form state for adding new grade
  const [newGrade, setNewGrade] = useState({ label: '', rank: 3, definition: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Loading states
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  
  // State for adding new category (must be declared before conditional return)
  const [newCategory, setNewCategory] = useState('');
  const [showCategoryForm, setShowCategoryForm] = useState(false);

  // Available default categories
  const defaultCategories = useMemo(() => ['Comics', 'Pyrex', 'Trading Cards', 'Coins', 'Toys'], []);

  // Get all categories from preferences plus defaults
  const allCategories = useMemo(() => {
    const userCategories = Object.keys(preferences?.gradingScales || {});
    const merged = new Set([...defaultCategories, ...userCategories]);
    return Array.from(merged).sort();
  }, [preferences, defaultCategories]);

  // Get grades for selected category
  const selectedGrades = useMemo(() => {
    if (!selectedCategory) return [];
    return preferences?.gradingScales?.[selectedCategory] || [];
  }, [selectedCategory, preferences]);
  
  // Clear message after 3 seconds
  React.useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Redirect if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-700">Please log in to access settings</h2>
          <button
            onClick={() => navigate('/')}
            className="mt-4 py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  // Handle adding a new grade
  const handleAddGrade = async () => {
    if (!newGrade.label || !newGrade.definition) {
      setMessage({ type: 'error', text: 'Label and definition are required' });
      return;
    }

    if (!selectedCategory) {
      setMessage({ type: 'error', text: 'Please select a category first' });
      return;
    }

    setLoading(true);
    try {
      const currentGrades = preferences?.gradingScales?.[selectedCategory] || [];
      const updatedGrades = [...currentGrades, { ...newGrade }];
      
      const result = await updatePreferences({
        gradingScales: {
          [selectedCategory]: updatedGrades
        }
      });

      if (result.success) {
        setNewGrade({ label: '', rank: 3, definition: '' });
        setShowAddForm(false);
        setMessage({ type: 'success', text: 'Grade added successfully' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to add grade' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to add grade' });
    }
    setLoading(false);
  };

  // Handle loading defaults
  const handleLoadDefaults = async () => {
    setLoading(true);
    try {
      const result = await loadDefaultScales();
      if (result.success) {
        setMessage({ type: 'success', text: 'Default grading scales loaded' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to load defaults' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load defaults' });
    }
    setLoading(false);
  };

  // Handle deleting a grade
  const handleDeleteGrade = async (index) => {
    if (!selectedCategory) return;

    setLoading(true);
    try {
      const currentGrades = preferences?.gradingScales?.[selectedCategory] || [];
      const updatedGrades = currentGrades.filter((_, i) => i !== index);
      
      const result = await updatePreferences({
        gradingScales: {
          [selectedCategory]: updatedGrades
        }
      });

      if (result.success) {
        setMessage({ type: 'success', text: 'Grade removed' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to remove grade' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to remove grade' });
    }
    setLoading(false);
  };

  // Handle adding a new category
  const handleAddCategory = async () => {
    if (!newCategory.trim()) {
      setMessage({ type: 'error', text: 'Category name is required' });
      return;
    }

    if (allCategories.includes(newCategory.trim())) {
      setMessage({ type: 'error', text: 'Category already exists' });
      return;
    }

    setLoading(true);
    try {
      const result = await updatePreferences({
        gradingScales: {
          [newCategory.trim()]: []
        }
      });

      if (result.success) {
        setSelectedCategory(newCategory.trim());
        setNewCategory('');
        setShowCategoryForm(false);
        setMessage({ type: 'success', text: 'Category added' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to add category' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to add category' });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="mt-1 text-gray-600">Manage your collectibles grading scales</p>
          </div>
          <button
            onClick={() => navigate('/gallery')}
            className="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            ← Back to Gallery
          </button>
        </div>

        {/* Message toast */}
        {message && (
          <div className={`mb-4 p-4 rounded-md ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {/* Main content - two columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left column - Categories */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Categories</h2>
              <button
                onClick={() => setShowCategoryForm(!showCategoryForm)}
                className="text-sm text-indigo-600 hover:text-indigo-800"
                disabled={loading}
              >
                + Add
              </button>
            </div>

            {/* Add category form */}
            {showCategoryForm && (
              <div className="mb-4 p-3 bg-gray-50 rounded-md">
                <input
                  type="text"
                  placeholder="Category name"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  disabled={loading}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleAddCategory}
                    disabled={loading}
                    className="px-3 py-1 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowCategoryForm(false)}
                    className="px-3 py-1 text-gray-600 text-sm hover:text-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Category list */}
            <ul className="space-y-1" data-testid="category-list">
              {allCategories.map((category) => (
                <li key={category}>
                  <button
                    onClick={() => setSelectedCategory(category)}
                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                      selectedCategory === category
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    {category}
                    {preferences?.gradingScales?.[category]?.length > 0 && (
                      <span className="ml-2 text-xs text-gray-500">
                        ({preferences.gradingScales[category].length})
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>

            {/* Load defaults button */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={handleLoadDefaults}
                disabled={loading || !cookieReady}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 text-sm"
                data-testid="load-defaults-btn"
              >
                Load Defaults
              </button>
              <p className="mt-2 text-xs text-gray-500">
                Adds standard grading scales for common categories
              </p>
            </div>
          </div>

          {/* Right column - Grading Scale Table */}
          <div className="md:col-span-2 bg-white rounded-lg shadow p-6">
            {selectedCategory ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedCategory} Grading Scale
                  </h2>
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="px-3 py-1 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
                    disabled={loading}
                    data-testid="add-grade-btn"
                  >
                    + Add Grade
                  </button>
                </div>

                {/* Add grade form */}
                {showAddForm && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-md" data-testid="add-grade-form">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Label
                        </label>
                        <input
                          type="text"
                          placeholder="e.g., Mint"
                          value={newGrade.label}
                          onChange={(e) => setNewGrade({ ...newGrade, label: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          disabled={loading}
                          data-testid="grade-label-input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Rank (1-5)
                        </label>
                        <select
                          value={newGrade.rank}
                          onChange={(e) => setNewGrade({ ...newGrade, rank: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          disabled={loading}
                          data-testid="grade-rank-select"
                        >
                          <option value={1}>1 - Poor</option>
                          <option value={2}>2 - Fair</option>
                          <option value={3}>3 - Good</option>
                          <option value={4}>4 - Very Good</option>
                          <option value={5}>5 - Mint</option>
                        </select>
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Definition
                        </label>
                        <textarea
                          placeholder="Describe what this grade means..."
                          value={newGrade.definition}
                          onChange={(e) => setNewGrade({ ...newGrade, definition: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          rows={2}
                          disabled={loading}
                          data-testid="grade-definition-input"
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={handleAddGrade}
                        disabled={loading}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                        data-testid="save-grade-btn"
                      >
                        Save Grade
                      </button>
                      <button
                        onClick={() => {
                          setShowAddForm(false);
                          setNewGrade({ label: '', rank: 3, definition: '' });
                        }}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Grades table */}
                {selectedGrades.length > 0 ? (
                  <div className="overflow-x-auto" data-testid="grades-table">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Rank
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Label
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Definition
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedGrades
                          .sort((a, b) => b.rank - a.rank)
                          .map((grade, index) => (
                            <tr key={`${grade.label}-${index}`}>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                                  grade.rank >= 4 ? 'bg-green-100 text-green-800' :
                                  grade.rank === 3 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {grade.rank}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                                {grade.label}
                              </td>
                              <td className="px-4 py-3 text-gray-500 text-sm">
                                {grade.definition}
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <button
                                  onClick={() => handleDeleteGrade(
                                    selectedGrades.findIndex(g => g.label === grade.label && g.rank === grade.rank)
                                  )}
                                  className="text-red-600 hover:text-red-800 text-sm"
                                  disabled={loading}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p>No grading scales defined for {selectedCategory}.</p>
                    <p className="mt-2 text-sm">Click "Add Grade" to create one, or "Load Defaults" to use standard scales.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <p>Select a category to view or edit its grading scale.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
