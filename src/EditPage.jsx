import React, { useState, useEffect } from 'react'
import ImageCanvasEditor from './ImageCanvasEditor'

export default function EditPage({ photo, onClose, onSave, onFinished }) {
  const [caption, setCaption] = useState(photo?.caption || '')
  const [description, setDescription] = useState(photo?.description || '')
  const [keywords, setKeywords] = useState(photo?.keywords || '')
  const [textStyle, setTextStyle] = useState(photo?.textStyle || null)
  const [saving, setSaving] = useState(false)
  const [showMetadata, setShowMetadata] = useState(false)

  useEffect(() => {
    setCaption(photo?.caption || '')
    setDescription(photo?.description || '')
    setKeywords(photo?.keywords || '')
    setTextStyle(photo?.textStyle || null)
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
      const updated = { ...photo, caption, description, keywords, textStyle };
      await onSave(updated)
    } catch (e) {
      console.error('Save failed', e)
    } finally {
      setSaving(false)
    }
  }

  const handleCanvasSave = async (dataURL, newTextStyle) => {
    console.log('Canvas saved with caption overlay!');
    setSaving(true);
    try {
      // Save the text styling for persistence
      setTextStyle(newTextStyle);
      
      // Update the photo with the new text style
      const updated = { ...photo, caption, description, keywords, textStyle: newTextStyle };
      await onSave(updated);
      
      // TODO: Send dataURL to backend to save the captioned image file
      // For now, we're just persisting the text position/style
      alert('Caption position and styling saved!');
    } catch (e) {
      console.error('Canvas save failed', e);
      alert('Failed to save caption styling');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="bg-white overflow-hidden flex flex-col"
      style={{
        height: '100%',
        boxSizing: 'border-box',
        borderRadius: '8px',
        border: '2px solid #4a5568',
        boxShadow: '0 2px 10px rgba(0,0,0,0.16)',
      }}
    >
      {/* Header with buttons - compact */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h1 className="text-lg font-bold">Edit Photo — {photo.filename}</h1>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300">Back</button>
          <button onClick={() => { onFinished(photo.id); }} className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700">Mark as Finished</button>
        </div>
      </div>

      {/* 2-column layout with right side split into top/bottom panels */}
      <div className="flex-1 flex overflow-hidden" style={{ gap: '7px', padding: '7px 7px 7px 7px', backgroundColor: 'white' }}>
        {/* Left column: Interactive Canvas Editor (50%) */}
        <div className="w-1/2 rounded border overflow-hidden" style={{ backgroundColor: '#f5f5f5' }}>
          <ImageCanvasEditor 
            imageUrl={displayUrl}
            caption={caption}
            textStyle={textStyle}
            onSave={handleCanvasSave}
          />
        </div>

        {/* Right column: Split into top (metadata/form) and bottom (chat) - (50%) */}
        <div className="w-1/2 flex flex-col" style={{ gap: '7px' }}>
          {/* Top right: Metadata and form (50% of right side) */}
          <div className="h-1/2 flex flex-col p-6 overflow-y-auto overflow-x-hidden rounded border" style={{ backgroundColor: '#f5f5f5' }}>
            <div className="mb-2">
              <label className="block font-semibold mb-1 text-sm">Caption</label>
              <textarea 
                className="w-full border rounded p-2 text-sm" 
                rows={2}
                value={caption} 
                onChange={e => setCaption(e.target.value)} 
              />
            </div>
            
            <div className="mb-2">
              <label className="block font-semibold mb-1 text-sm">Description</label>
              <textarea 
                className="w-full border rounded p-2 text-sm" 
                rows={4}
                value={description} 
                onChange={e => setDescription(e.target.value)} 
              />
            </div>
            
            <div className="mb-3">
              <label className="block font-semibold mb-1 text-sm">Keywords</label>
              <textarea 
                className="w-full border rounded p-2 text-sm resize-none overflow-hidden" 
                rows={2}
                value={keywords} 
                onChange={e => setKeywords(e.target.value)}
                style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
              />
            </div>
            
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
              <button onClick={onClose} className="px-3 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
            </div>
          </div>

          {/* Bottom right: Chat placeholder (50% of right side) */}
          <div className="h-1/2 flex flex-col p-6 rounded border" style={{ backgroundColor: '#f5f5f5' }}>
            <h3 className="font-semibold mb-2 text-sm">AI Chat (Coming Soon)</h3>
            <div className="flex-1 border rounded p-3 bg-white text-sm text-gray-500 flex items-center justify-center">
              Chat interface will appear here
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
