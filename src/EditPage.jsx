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
    <div className="fixed inset-0 bg-white z-[200000] overflow-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Edit Photo — {photo.filename}</h1>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1 bg-gray-200 rounded">Back</button>
            <button onClick={() => { onFinished(photo.id); }} className="px-3 py-1 bg-green-600 text-white rounded">Mark as Finished</button>
          </div>
        </div>

        <div
          className="flex flex-col lg:flex-row gap-6"
          style={{ minHeight: '60vh' }}
        >
          <div
            className="border rounded p-4 bg-gray-50 flex-1 lg:basis-2/5 lg:max-w-[40%] lg:flex-none flex items-center justify-center overflow-auto"
            style={{ minWidth: 0, maxHeight: '85vh' }}
          >
            <img
              src={displayUrl}
              alt={photo.filename}
              className="max-w-full w-auto h-auto object-contain"
              style={{
                maxHeight: '80vh',
                display: 'block',
                margin: '0 auto',
                borderRadius: '8px',
                background: '#f8fafc',
              }}
            />
          </div>
          <div className="flex flex-col flex-1 min-w-0 lg:basis-3/5 lg:max-w-[60%] lg:flex-none">
            <div className="border rounded p-4 mb-4">
              <h3 className="font-semibold mb-2">Metadata</h3>
              <div className="text-sm text-gray-700">
                <p><strong>File Size:</strong> {photo.file_size}</p>
                <p><strong>State:</strong> {photo.state}</p>
                <p><strong>Hash:</strong> {photo.hash || 'N/A'}</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block font-semibold mb-2">Caption</label>
              <textarea className="w-full border rounded p-2" rows={4} value={caption} onChange={e => setCaption(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded">{saving ? 'Saving...' : 'Save'}</button>
              <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
