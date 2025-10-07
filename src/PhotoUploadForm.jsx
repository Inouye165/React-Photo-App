import React from "react";

const PhotoUploadForm = ({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  uploading,
  filteredLocalPhotos,
  handleUploadFiltered,
  setShowLocalPicker
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
    <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-auto m-4">
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="text-xl font-bold">Select Photos to Upload</h2>
        <button
          onClick={() => setShowLocalPicker(false)}
          className="text-gray-500 hover:text-gray-700 text-xl font-bold"
        >
          ×
        </button>
      </div>
      <div className="p-4">
        <div className="mb-4 flex gap-4 items-center">
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="border rounded px-2 py-1"
            placeholder="Start Date"
          />
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="border rounded px-2 py-1"
            placeholder="End Date"
          />
          <button
            onClick={handleUploadFiltered}
            disabled={uploading || filteredLocalPhotos.length === 0}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
          >
            {uploading ? `Uploading...` : `Upload ${filteredLocalPhotos.length} Photos`}
          </button>
        </div>
        <div className="font-medium mb-2">Photos to Upload ({filteredLocalPhotos.length}):</div>
        <div className="grid grid-cols-4 gap-4">
          {filteredLocalPhotos.map((p, i) => (
            <div key={i} className="border rounded p-2 flex flex-col items-center">
              <div className="truncate w-full text-xs mb-1">{p.name}</div>
              <div className="text-xs text-gray-500 mb-1">{p.exifDate ? new Date(p.exifDate).toLocaleString() : new Date(p.lastModified).toLocaleString()}</div>
              <img src={URL.createObjectURL(p.file)} alt={p.name} className="max-h-24 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default PhotoUploadForm;
