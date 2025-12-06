import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import PhotoUploadForm from '../PhotoUploadForm.jsx';
import useLocalPhotoPicker from '../hooks/useLocalPhotoPicker.js';

/**
 * UploadPage - Dedicated page for photo uploads
 * Route: /upload
 * 
 * This page is the landing destination when:
 * - User has no photos (SmartRouter redirects here)
 * - User explicitly navigates to upload new photos
 * 
 * Provides a clear call-to-action for new users instead of
 * dropping them into an empty gallery.
 */
export default function UploadPage() {
  const navigate = useNavigate();
  const { setToolbarMessage } = useOutletContext();

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
    onUploadComplete: () => {
      // After upload completes, navigate to gallery to see the new photos
      navigate('/gallery?view=working');
    },
    onUploadSuccess: (count) => {
      setToolbarMessage(`Successfully uploaded ${count} photos`);
    },
  });

  // Track if user has selected a folder
  const hasSelectedFolder = filteredLocalPhotos.length > 0;

  // Handle folder selection flow
  const handleStartUpload = async () => {
    await handleSelectFolder();
  };

  // Close/cancel handler - go to gallery
  const handleClose = () => {
    navigate('/gallery?view=working');
  };

  // If no folder selected yet, show the welcome/empty state
  if (!hasSelectedFolder) {
    return (
      <div 
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 120px)',
          padding: '32px',
          textAlign: 'center'
        }}
      >
        <div 
          style={{
            maxWidth: '500px',
            padding: '48px',
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
            border: '1px solid #e2e8f0'
          }}
        >
          {/* Icon */}
          <div 
            style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 24px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 16px rgba(79, 70, 229, 0.3)'
            }}
          >
            <svg 
              width="40" 
              height="40" 
              fill="none" 
              stroke="white" 
              viewBox="0 0 24 24"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>

          {/* Title */}
          <h1 
            style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#1e293b',
              marginBottom: '12px'
            }}
          >
            Upload Your Photos
          </h1>

          {/* Description */}
          <p 
            style={{
              fontSize: '16px',
              color: '#64748b',
              lineHeight: '1.6',
              marginBottom: '32px'
            }}
          >
            Select a folder from your computer to get started. 
            Your photos will be uploaded and processed automatically.
          </p>

          {/* Primary Action Button */}
          <button
            onClick={handleStartUpload}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '16px 32px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#ffffff',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(79, 70, 229, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.4)';
            }}
          >
            <svg 
              width="20" 
              height="20" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              strokeWidth="2"
            >
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            Select Folder
          </button>

          {/* Secondary link */}
          <div style={{ marginTop: '24px' }}>
            <button
              onClick={handleClose}
              style={{
                fontSize: '14px',
                color: '#64748b',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Go to Gallery →
            </button>
          </div>

          {/* Features list */}
          <div 
            style={{
              marginTop: '32px',
              paddingTop: '24px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              textAlign: 'left'
            }}
          >
            {[
              { icon: '📸', text: 'Supports JPEG, PNG, and HEIC formats' },
              { icon: '🔄', text: 'Automatic HEIC to JPEG conversion' },
              { icon: '🤖', text: 'AI-powered metadata extraction' },
            ].map((feature, i) => (
              <div 
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '14px',
                  color: '#475569'
                }}
              >
                <span>{feature.icon}</span>
                <span>{feature.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Once folder is selected, show the full upload form
  return (
    <div style={{ position: 'relative', minHeight: 'calc(100vh - 80px)' }}>
      <PhotoUploadForm
        startDate={startDate}
        endDate={endDate}
        setStartDate={setStartDate}
        setEndDate={setEndDate}
        uploading={uploading}
        filteredLocalPhotos={filteredLocalPhotos}
        handleUploadFiltered={handleUploadFiltered}
        onReopenFolder={handleSelectFolder}
        isStandalonePage={true}
        closeReason="upload-page-close"
        onClose={handleClose}
      />
    </div>
  );
}
