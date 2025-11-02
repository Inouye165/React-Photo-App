import React from 'react';
import { toUrl } from '../utils/toUrl.js';

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
}) {
  if (!photo) return null;

  return (
    <div className="bg-white rounded-lg shadow-md h-full p-6">
      <div className="flex items-start h-full gap-4" style={{ height: 'calc(100vh - 140px)' }}>
        <div className="w-2/5 bg-gray-100 rounded overflow-auto flex items-center justify-center px-2 py-3" style={{ maxHeight: '100%' }}>
          <img
            src={toUrl(photo.url, apiBaseUrl)}
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
              </div>
            </section>
          </div>

          <div className="sticky bottom-0 bg-white pt-2 -mx-4 px-4 pb-2 border-t">
            <div className="flex justify-end gap-2 flex-wrap">
              <button onClick={onClose} className="px-3 py-1 bg-gray-100 border rounded text-sm">
                Close
              </button>
              {onRecheckAI && (
                <button
                  onClick={onRecheckAI}
                  className="px-3 py-1 bg-purple-600 text-white rounded text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={isRechecking}
                >
                  {isRechecking ? 'Rechecking...' : 'Recheck AI'}
                </button>
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
