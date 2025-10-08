import React, { useState, useEffect } from 'react'

export default function EditPage({ photo, onClose, onSave, onFinished }) {
  const [caption, setCaption] = useState(photo?.caption || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCaption(photo?.caption || '')
  }, [photo])

  // Lock background scroll while this full-page editor is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    try { document.body.style.overflow = 'hidden'; } catch {}
    return () => { try { document.body.style.overflow = prev || ''; } catch {} };
  }, []);

  if (!photo) return null

  const displayUrl = `http://localhost:3001/display/${photo.state}/${photo.filename}`

  const handleSave = async () => {
    setSaving(true)
    try {
      // Minimal: update locally via onSave. Backend persist not implemented here.
      const updated = { ...photo, caption };
      await onSave(updated)
    } catch (e) {
      console.error('Save failed', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="bg-white overflow-hidden flex flex-col"
      style={{
        margin: '0 16px 16px 16px',
        height: 'calc(100vh - 112px)',
        boxSizing: 'border-box',
        borderRadius: '8px',
        border: '2px solid #4a5568',
        boxShadow: '0 2px 10px rgba(0,0,0,0.16)',
      }}
    >
      {/* Header with buttons */}
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-2xl font-bold">Edit Photo — {photo.filename}</h1>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">Back</button>
          <button onClick={() => { onFinished(photo.id); }} className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">Mark as Finished</button>
        </div>
      </div>

      {/* 2-column layout: Image left, metadata/form right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left column: Image (50%) */}
        <div className="w-1/2 bg-gray-50 flex items-center justify-center p-4 overflow-auto">
          <img
            src={displayUrl}
            alt={photo.filename}
            className="max-w-full max-h-full object-contain"
          />
        </div>

        {/* Right column: Metadata and form (50%) */}
        <div className="w-1/2 flex flex-col p-6 overflow-auto border-l">
          <div className="border rounded p-4 mb-4 bg-gray-50">
            <h3 className="font-semibold mb-2">Metadata</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong>File Size:</strong> {photo.file_size}</p>
              <p><strong>State:</strong> {photo.state}</p>
              <p><strong>Hash:</strong> {photo.hash || 'N/A'}</p>
            </div>
          </div>
          <div className="mb-4 flex-1">
            <label className="block font-semibold mb-2">Caption</label>
            <textarea 
              className="w-full border rounded p-2 h-32" 
              value={caption} 
              onChange={e => setCaption(e.target.value)} 
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
