import React, { useState, useEffect } from 'react'

export default function EditPage({ photo, onClose, onSave, onFinished }) {
  const [caption, setCaption] = useState(photo?.caption || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCaption(photo?.caption || '')
  }, [photo])

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
    <div className="fixed inset-0 bg-white z-50 overflow-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Edit Photo — {photo.filename}</h1>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1 bg-gray-200 rounded">Back</button>
            <button onClick={() => { onFinished(photo.id); }} className="px-3 py-1 bg-green-600 text-white rounded">Mark as Finished</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="col-span-2">
            <div className="border rounded p-4">
              <img src={displayUrl} alt={photo.filename} className="w-full h-auto object-contain" />
            </div>
            <div className="mt-4">
              <label className="block font-semibold mb-2">Caption</label>
              <textarea className="w-full border rounded p-2" rows={4} value={caption} onChange={e => setCaption(e.target.value)} />
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded">{saving ? 'Saving...' : 'Save'}</button>
              <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
            </div>
          </div>

          <div className="col-span-1">
            <div className="border rounded p-4">
              <h3 className="font-semibold mb-2">Metadata</h3>
              <div className="text-sm text-gray-700">
                <p><strong>File Size:</strong> {photo.file_size}</p>
                <p><strong>State:</strong> {photo.state}</p>
                <p><strong>Hash:</strong> {photo.hash || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
