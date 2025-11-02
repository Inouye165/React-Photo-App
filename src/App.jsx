import React, { useEffect, useState } from 'react';
import { logGlobalError } from './utils/globalLog.js';
import { API_BASE_URL } from './api.js';
import Toolbar from './Toolbar.jsx';
import PhotoUploadForm from './PhotoUploadForm.jsx';
import EditPage from './EditPage.jsx';
import useAIPolling from './hooks/useAIPolling.jsx';
import Toast from './components/Toast.jsx';
import MetadataModal from './components/MetadataModal.jsx';
import PhotoTable from './components/PhotoTable.jsx';
import PhotoDetailPanel from './components/PhotoDetailPanel.jsx';
import usePhotoPrivileges from './hooks/usePhotoPrivileges.js';
import useLocalPhotoPicker from './hooks/useLocalPhotoPicker.js';
import usePhotoManagement from './hooks/usePhotoManagement.js';

function App() {
  const [toolbarMessage, setToolbarMessage] = useState('');
  const {
    photos,
    toast,
    setToast,
    loading,
    setView,
    setActivePhotoId,
    activePhoto,
    setEditingMode,
    editedCaption,
    setEditedCaption,
    editedDescription,
    setEditedDescription,
    editedKeywords,
    setEditedKeywords,
    showMetadataModal,
    setShowMetadataModal,
    metadataPhoto,
    setMetadataPhoto,
    pollingPhotoId,
    refreshPhotos,
    isInlineEditing,
    isFullPageEditing,
    handleRecheckSinglePhoto,
    handleMoveToFinished,
    handleMoveToWorking,
    handleInlineSave,
    handleDeletePhoto,
    handleEditPhoto,
    handleSelectPhoto,
    handleCloseDetail,
    handleCloseEditor,
    handleMoveToInprogress,
    setPhotos,
  } = usePhotoManagement();

  useEffect(() => {
    if (!(import.meta?.env?.DEV)) return;
    if (typeof window === 'undefined') return;

    logGlobalError('Dev: global log test');
    window.logGlobalError = logGlobalError;

    return () => {
      try {
        delete window.logGlobalError;
      } catch {
        window.logGlobalError = undefined;
      }
    };
  }, []);

  useAIPolling();

  const privilegesMap = usePhotoPrivileges(photos);

  const {
    filteredLocalPhotos,
    handleSelectFolder,
    handleUploadFiltered,
    showPicker: showLocalPicker,
    setShowPicker: setShowLocalPicker,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    uploading,
  } = useLocalPhotoPicker({
    onUploadComplete: refreshPhotos,
    onUploadSuccess: (count) => setToolbarMessage(`Successfully uploaded ${count} photos`),
    setToast,
  });

  useEffect(() => {
    if (!(import.meta?.env?.DEV)) return;
    if (!activePhoto) return;
    try {
      console.debug(
        '[App] activePhoto changed',
        {
          id: activePhoto.id,
          caption: activePhoto.caption,
          description: activePhoto.description && String(activePhoto.description).slice(0, 200),
        },
      );
    } catch (error) {
      console.warn('[App] debug log failed', error);
    }
  }, [activePhoto]);

  return (
    <div
      className="flex flex-col bg-gray-100"
      id="main-app-container"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: '72px',
      }}
    >
      <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50">
        <Toast
          message={toast?.message}
          severity={toast?.severity}
          onClose={() => setToast({ message: '' })}
        />
      </div>

      <Toolbar
        onSelectFolder={handleSelectFolder}
        onViewStaged={() => {
          setView('working');
          setEditingMode(null);
          setActivePhotoId(null);
          setShowMetadataModal(false);
          setMetadataPhoto(null);
        }}
        onViewInprogress={() => {
          setView('inprogress');
          setEditingMode(null);
          setActivePhotoId(null);
          setShowMetadataModal(false);
          setMetadataPhoto(null);
        }}
        onViewFinished={() => {
          setView('finished');
          setEditingMode(null);
          setActivePhotoId(null);
          setShowMetadataModal(false);
          setMetadataPhoto(null);
        }}
        onShowMetadata={() => {
          if (activePhoto) {
            setMetadataPhoto(activePhoto);
            setShowMetadataModal(true);
          } else {
            setToast({ message: 'Please select a photo first', severity: 'warning' });
          }
        }}
        toolbarMessage={toolbarMessage}
        onClearToolbarMessage={() => setToolbarMessage('')}
      />

      <div aria-live="polite" className="sr-only">
        {toolbarMessage}
      </div>

      {showMetadataModal && metadataPhoto && (
        <MetadataModal photo={metadataPhoto} onClose={() => { setShowMetadataModal(false); setMetadataPhoto(null); }} />
      )}

      {showLocalPicker && (
        <PhotoUploadForm
          startDate={startDate}
          endDate={endDate}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
          uploading={uploading}
          filteredLocalPhotos={filteredLocalPhotos}
          handleUploadFiltered={handleUploadFiltered}
          setShowLocalPicker={setShowLocalPicker}
          onReopenFolder={handleSelectFolder}
        />
      )}

      <div className="flex-1 overflow-auto" style={{ padding: '8px 16px 16px 16px' }}>
        {isFullPageEditing && activePhoto ? (
          <EditPage
            key={`${activePhoto.id}:${activePhoto.caption || ''}`}
            photo={activePhoto}
            onClose={handleCloseEditor}
            onFinished={async (id) => {
              await handleMoveToFinished(id);
            }}
            onSave={async (updated) => {
              setPhotos((prev) =>
                prev.map((photo) => (photo.id === updated.id ? { ...photo, ...updated } : photo)),
              );
              setEditingMode(null);
              setActivePhotoId(updated.id);
            }}
            onRecheckAI={handleRecheckSinglePhoto}
            setToast={setToast}
          />
        ) : activePhoto ? (
          <PhotoDetailPanel
            photo={activePhoto}
            isInlineEditing={isInlineEditing}
            editedCaption={editedCaption}
            editedDescription={editedDescription}
            editedKeywords={editedKeywords}
            onCaptionChange={setEditedCaption}
            onDescriptionChange={setEditedDescription}
            onKeywordsChange={setEditedKeywords}
            onClose={handleCloseDetail}
            onInlineSave={handleInlineSave}
            onMarkFinished={async () => {
              await handleMoveToFinished(activePhoto.id);
            }}
            onRecheckAI={async () => {
              try {
                await handleRecheckSinglePhoto(activePhoto.id);
              } catch {
                /* toast already reported error */
              }
            }}
            isRechecking={pollingPhotoId === activePhoto.id}
            apiBaseUrl={API_BASE_URL}
          />
        ) : (
          <PhotoTable
            photos={photos}
            loading={loading}
            privilegesMap={privilegesMap}
            pollingPhotoId={pollingPhotoId}
            onSelectPhoto={handleSelectPhoto}
            onEditPhoto={(photo) => handleEditPhoto(photo, false)}
            onMoveToInprogress={handleMoveToInprogress}
            onMoveToWorking={handleMoveToWorking}
            onDeletePhoto={handleDeletePhoto}
            apiBaseUrl={API_BASE_URL}
          />
        )}
      </div>
    </div>
  );
}

export default App;
