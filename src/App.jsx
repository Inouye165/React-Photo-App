import React, { useCallback, useEffect, useState } from 'react';
import { logGlobalError } from './utils/globalLog.js';
import { API_BASE_URL, getDependencyStatus } from './api.js';
import Toolbar from './Toolbar.jsx';
import PhotoUploadForm from './PhotoUploadForm.jsx';
import EditPage from './EditPage.jsx';
import useAIPolling from './hooks/useAIPolling.jsx';
import MetadataModal from './components/MetadataModal.jsx';
import PhotoTable from './components/PhotoTable.jsx';
import PhotoDetailPanel from './components/PhotoDetailPanel.jsx';
import usePhotoPrivileges from './hooks/usePhotoPrivileges.js';
import useLocalPhotoPicker from './hooks/useLocalPhotoPicker.js';
import usePhotoManagement from './hooks/usePhotoManagement.js';
import useStore from './store.js';

const AI_DEPENDENCY_WARNING = 'AI services unavailable. Start required Docker containers to re-enable processing.';

function App() {
  // Global banner notification from Zustand (will be shown inside the Toolbar)
  const banner = useStore((state) => state.banner);
  const setBanner = useStore((state) => state.setBanner);
  const [toolbarMessage, setToolbarMessage] = useState('');
  const [dependencyWarning, setDependencyWarning] = useState('');
  const [aiDependenciesReady, setAiDependenciesReady] = useState(true);

  // UI state from store
  const showMetadataModal = useStore((state) => state.showMetadataModal);
  const metadataPhoto = useStore((state) => state.metadataPhoto);
  const setShowMetadataModal = useStore((state) => state.setShowMetadataModal);
  const setMetadataPhoto = useStore((state) => state.setMetadataPhoto);
  const showLocalPicker = useStore((state) => state.showUploadPicker);
  const setEditingMode = useStore((state) => state.setEditingMode);
  const setActivePhotoId = useStore((state) => state.setActivePhotoId);

  const {
    photos,
    loading,
    activePhoto,
    editedCaption,
    setEditedCaption,
    editedDescription,
    setEditedDescription,
    editedKeywords,
    setEditedKeywords,
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let cancelled = false;
    let intervalId = null;

    const applyStatus = (queueReady) => {
      if (cancelled) return;
      setAiDependenciesReady((prev) => (prev === queueReady ? prev : queueReady));
      setDependencyWarning((prev) => {
        const next = queueReady ? '' : AI_DEPENDENCY_WARNING;
        return prev === next ? prev : next;
      });
    };

    const checkStatus = async () => {
      try {
        const result = await getDependencyStatus();
        if (cancelled || !result) return;
        const queueReady = !(result.dependencies && result.dependencies.aiQueue === false);
        applyStatus(queueReady);
      } catch {
        applyStatus(false);
      }
    };

    checkStatus();
    intervalId = window.setInterval(checkStatus, 30000);

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useAIPolling();

  const privilegesMap = usePhotoPrivileges(photos);

  const {
    filteredLocalPhotos,
    handleSelectFolder,
    handleUploadFiltered,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    uploading,
  } = useLocalPhotoPicker({
    onUploadComplete: refreshPhotos,
    onUploadSuccess: (count) => setToolbarMessage(`Successfully uploaded ${count} photos`),
  });

  const guardedRecheckAI = useCallback(async (photoId, model) => {
    if (!aiDependenciesReady) {
      setBanner({ message: AI_DEPENDENCY_WARNING, severity: 'warning' });
      return null;
    }
    return handleRecheckSinglePhoto(photoId, model);
  }, [aiDependenciesReady, handleRecheckSinglePhoto, setBanner]);

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
        // Provide enough top padding so content starts below fixed toolbar (~60-70px height)
        paddingTop: '96px',
      }}
    >
      <Toolbar
        onSelectFolder={handleSelectFolder}
        toolbarMessage={dependencyWarning || toolbarMessage || banner?.message}
        toolbarSeverity={dependencyWarning ? 'warning' : (banner?.severity || 'info')}
        onClearToolbarMessage={dependencyWarning ? undefined : () => { setToolbarMessage(''); setBanner({ message: '' }); }}
      />

      {/* Banner is now displayed inside the Toolbar via toolbarMessage */}

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
            onRecheckAI={guardedRecheckAI}
            aiReady={aiDependenciesReady}
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
            onRecheckAI={guardedRecheckAI}
            isRechecking={pollingPhotoId === activePhoto.id}
            apiBaseUrl={API_BASE_URL}
            aiReady={aiDependenciesReady}
          />
        ) : (
          <PhotoTable
            photos={photos}
            loading={loading}
            privilegesMap={privilegesMap}
            pollingPhotoId={pollingPhotoId}
            onSelectPhoto={handleSelectPhoto}
            onEditPhoto={(photo) => handleEditPhoto(photo, true)}
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
