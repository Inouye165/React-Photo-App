import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { logGlobalError } from './utils/globalLog.js';
import GlobalErrorBoundary from './components/GlobalErrorBoundary.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import PhotoGalleryPage from './pages/PhotoGalleryPage.jsx';
import PhotoDetailPage from './pages/PhotoDetailPage.jsx';
import PhotoEditPage from './pages/PhotoEditPage.jsx';

/**
 * App - Root component with routing and error boundary
 * Step 2: Proper route definitions with URL parameters
 */
function App() {
  // Dev-only global error logging setup
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

  return (
    <GlobalErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            {/* Gallery view - default route */}
            <Route index element={<PhotoGalleryPage />} />
            
            {/* Photo detail view */}
            <Route path="/photos/:id" element={<PhotoDetailPage />} />
            
            {/* Photo edit view */}
            <Route path="/photos/:id/edit" element={<PhotoEditPage />} />
            
            {/* Catch-all redirect to gallery */}
            <Route path="*" element={<PhotoGalleryPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </GlobalErrorBoundary>
  );
}

export default App;
