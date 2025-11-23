
import React, { useEffect, useState } from 'react';
import { toUrl } from '../utils/toUrl.js';
import * as api from '../api';
import ModelSelect from './ModelSelect';
import { DEFAULT_MODEL } from '../config/modelCatalog';
import { useAuth } from '../contexts/AuthContext';


export default function PhotoDetailPanel({
  photo,
  isInlineEditing,
  editedCaption,
  editedDescription,
  editedKeywords,
  onCaptionChange,
  onDescriptionChange,
  onKeywordsChange,
  onClose,
  onInlineSave,
  onMarkFinished,
  onRecheckAI,
  isRechecking,
  apiBaseUrl,
  aiReady = true,
}) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [collectibles, setCollectibles] = useState([]);
  const [collectibleNotes, setCollectibleNotes] = useState({});
  const [savingNotes, setSavingNotes] = useState({});
  const [creating, setCreating] = useState(false);
  const [loadingCollectibles, setLoadingCollectibles] = useState(false);

  // Fetch collectibles when photo changes
  useEffect(() => {
    if (!photo?.id) return;
    setLoadingCollectibles(true);
    api.fetchCollectibles(photo.id)
      .then((data) => {
        setCollectibles(data || []);
        // Initialize notes state
        const notesObj = {};
        (data || []).forEach(c => { notesObj[c.id] = c.user_notes || ''; });
        setCollectibleNotes(notesObj);
      })
      .catch(() => setCollectibles([]))
      .finally(() => setLoadingCollectibles(false));
  }, [photo?.id]);

  // Handler for editing collectible notes
  const handleNoteChange = (id, value) => {
    setCollectibleNotes(notes => ({ ...notes, [id]: value }));
  };

  // Handler for saving collectible note
  const handleSaveNote = async (id) => {
    setSavingNotes(s => ({ ...s, [id]: true }));
    try {
      await api.updateCollectible(id, { user_notes: collectibleNotes[id] });
      // Optionally, refresh collectibles
      const updated = await api.fetchCollectibles(photo.id);
      setCollectibles(updated || []);
    } catch {
      // Optionally show error
    } finally {
      setSavingNotes(s => ({ ...s, [id]: false }));
    }
  };

  // Handler for creating a new collectible
  const handleAddCollectible = async () => {
    setCreating(true);
    try {
      await api.createCollectible(photo.id, { name: 'New Item', user_notes: '' });
      const updated = await api.fetchCollectibles(photo.id);
      setCollectibles(updated || []);
    } catch {
      // Optionally show error
    } finally {
      setCreating(false);
    }
  };

  if (!photo) return null;

  return (
    <div className="bg-white rounded-lg shadow-md h-full p-6">
      <div className="flex items-start h-full gap-4" style={{ height: 'calc(100vh - 140px)' }}>
        <div className="w-2/5 bg-gray-100 rounded overflow-auto flex items-center justify-center px-2 py-3" style={{ maxHeight: '100%' }}>
          <img
            src={toUrl(photo.url, apiBaseUrl, token)}
            alt={photo.filename}
            className="max-h-full max-w-full object-contain"
            style={{ width: 'auto', height: 'auto' }}
          />
        </div>

        <div className="mx-3" style={{ width: '3px', backgroundColor: '#e5e7eb', height: '100%' }} />

        <aside
          className="w-3/5 bg-white rounded shadow-sm border p-8 flex flex-col"
          style={{ maxHeight: '100%', borderLeft: '1px solid #e5e7eb' }}
        >
          <header className="mb-3">
            <h2 className="text-lg font-semibold">{photo.filename}</h2>
            <div className="text-xs text-gray-500">{photo.metadata?.DateTimeOriginal || ''}</div>
          </header>

          <div className="space-y-4 mb-2" style={{ overflow: 'auto' }}>
            {/* --- Collectibles Section --- */}
            <section>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Collectibles</label>
                <button
                  className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs border border-blue-200 hover:bg-blue-200 disabled:opacity-60"
                  onClick={handleAddCollectible}
                  disabled={creating || loadingCollectibles}
                >
                  {creating ? 'Adding...' : 'Add Collectible'}
                </button>
              </div>
              {loadingCollectibles ? (
                <div className="text-xs text-gray-500 py-2">Loading collectibles...</div>
              ) : collectibles.length === 0 ? (
                <div className="text-xs text-gray-400 py-2">No collectibles for this photo.</div>
              ) : (
                <div className="space-y-3">
                  {collectibles.map(collectible => {
                    let ai = collectible.ai_analysis;
                    if (typeof ai === 'string') {
                      try { ai = JSON.parse(ai); } catch { ai = null; }
                    }
                    return (
                      <div key={collectible.id} className="border rounded p-3 bg-gray-50">
                        <div className="font-semibold text-sm mb-1">{collectible.name}</div>
                        {ai && (
                          <div className="mb-2 text-xs text-gray-700">
                            <div><b>Probable Identity:</b> {ai.probableIdentity || <span className="text-gray-400">N/A</span>}</div>
                            <div><b>Condition:</b> {ai.conditionAssessment || <span className="text-gray-400">N/A</span>}</div>
                            {ai.valuation && (
                              <div><b>Valuation:</b> ${ai.valuation.lowEstimateUSD} - ${ai.valuation.highEstimateUSD}</div>
                            )}
                          </div>
                        )}
                        <div className="mb-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                          <textarea
                            className="w-full rounded border p-1 text-xs bg-white"
                            rows={2}
                            value={collectibleNotes[collectible.id] ?? collectible.user_notes ?? ''}
                            onChange={e => handleNoteChange(collectible.id, e.target.value)}
                          />
                        </div>
                        <button
                          className="px-2 py-1 bg-green-600 text-white rounded text-xs disabled:opacity-60"
                          onClick={() => handleSaveNote(collectible.id)}
                          disabled={savingNotes[collectible.id]}
                        >
                          {savingNotes[collectible.id] ? 'Saving...' : 'Save Note'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <section>
              <label className="block text-sm font-medium text-gray-700 mb-1">Caption</label>
              {isInlineEditing ? (
                <textarea
                  value={editedCaption}
                  onChange={(event) => onCaptionChange(event.target.value)}
                  className="w-full rounded border p-2 text-sm bg-gray-50"
                />
              ) : (
                <div className="rounded border p-2 bg-gray-50 text-sm text-gray-700">
                  {photo.caption || <span className="text-gray-400">No caption</span>}
                </div>
              )}
            </section>

            <section>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              {isInlineEditing ? (
                <textarea
                  value={editedDescription}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                  className="w-full rounded border p-2 text-sm bg-gray-50"
                  rows={4}
                />
              ) : !photo.description || !photo.keywords ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <svg
                    className="animate-spin h-8 w-8 text-blue-500 mb-2"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    ></path>
                  </svg>
                  <span className="text-gray-500 text-sm">AI is processing this photo...</span>
                </div>
              ) : (
                <div className="rounded border p-2 bg-gray-50 text-sm text-gray-700">
                  {photo.description || <span className="text-gray-400">No description</span>}
                </div>
              )}
            </section>

            <section>
              <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
              {isInlineEditing ? (
                <input
                  value={editedKeywords}
                  onChange={(event) => onKeywordsChange(event.target.value)}
                  className="w-full rounded border p-2 text-sm bg-gray-50"
                />
              ) : !photo.description || !photo.keywords ? (
                <div className="flex flex-col items-center justify-center py-4">
                  <svg
                    className="animate-spin h-6 w-6 text-blue-500 mb-2"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    ></path>
                  </svg>
                  <span className="text-gray-500 text-xs">Waiting for AI info...</span>
                </div>
              ) : (
                <div className="rounded border p-2 bg-gray-50 text-sm text-gray-700">
                  {photo.keywords || <span className="text-gray-400">No keywords</span>}
                </div>
              )}
            </section>

            <section className="flex-1 min-h-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">AI Agent</label>
              <div className="h-full bg-gray-50 rounded p-3 overflow-auto text-sm text-gray-700 flex flex-col" style={{ minHeight: 0 }}>
                <div className="flex-1">
                  <p className="text-gray-400">AI chat agent placeholder. Integrate agent UI here (messages, input box, actions).</p>
                  <div className="mt-3 text-xs text-gray-500">
                    Example:
                    <ul className="list-disc ml-5">
                      <li>Ask: "Generate alt text for this image"</li>
                      <li>Ask: "Suggest 5 keywords"</li>
                    </ul>
                  </div>
                </div>
                <div className="text-xs text-gray-400 mt-2">Placeholder</div>
                {photo.aiModelHistory && Array.isArray(photo.aiModelHistory) && (
                  <div className="mt-3 text-xs text-gray-600">
                    <div className="font-medium text-sm mb-1">AI model history</div>
                    <ul className="list-none ml-0 space-y-2">
                      {photo.aiModelHistory.slice().reverse().map((entry, idx) => (
                        <li key={idx} className="p-2 bg-white border rounded">
                          <div className="text-xs text-gray-500">{new Date(entry.timestamp).toLocaleString()}</div>
                          <div className="text-sm">Run: <span className="font-medium">{entry.runType}</span></div>
                          <div className="text-sm">Models: <code className="text-xs">{entry.modelsUsed && Object.entries(entry.modelsUsed).map(([k,v])=>`${k}:${v}`).join(', ')}</code></div>
                          <div className="text-sm">Caption: <span className="text-gray-700">{entry.result && entry.result.caption}</span></div>
                          <div className="text-sm">Keywords: <span className="text-gray-700">{entry.result && entry.result.keywords}</span></div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="sticky bottom-0 bg-white pt-2 -mx-4 px-4 pb-2 border-t">
            <div className="flex justify-end gap-2 flex-wrap items-center">
              <button onClick={onClose} className="px-3 py-1 bg-gray-100 border rounded text-sm">
                Close
              </button>
              {onRecheckAI && (
                <div className="flex items-center gap-2">
                  <ModelSelect value={selectedModel} onChange={setSelectedModel} compact disabled={!aiReady} />
                  <button
                    onClick={() => {
                      const model = selectedModel || DEFAULT_MODEL;
                      try { onRecheckAI(photo.id, model); } catch { /* noop */ }
                    }}
                    className="px-3 py-1 bg-purple-600 text-white rounded text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={isRechecking || !aiReady}
                    title={aiReady ? `Recheck with selected model: ${selectedModel}` : 'AI services unavailable. Start required containers to re-enable processing.'}
                    aria-disabled={isRechecking || !aiReady}
                  >
                    {isRechecking ? 'Rechecking...' : `Recheck AI (${selectedModel})`}
                  </button>
                </div>
              )}
              <button onClick={onInlineSave} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">
                Save
              </button>
              <button onClick={onMarkFinished} className="px-3 py-1 bg-green-600 text-white rounded text-sm">
                Mark as Finished
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
