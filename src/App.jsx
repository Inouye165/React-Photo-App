import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { logGlobalError } from './utils/globalLog.js';
import GlobalErrorBoundary from './components/GlobalErrorBoundary.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import SmartRouter from './components/SmartRouter.jsx';
import PhotoGalleryPage from './pages/PhotoGalleryPage.jsx';
import PhotoEditPage from './pages/PhotoEditPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import AuthWrapper from './components/AuthWrapper.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';

/**
 * RedirectToEdit - Redirects /photos/:id to /photos/:id/edit
 * This ensures clicking on any photo always goes to the modern edit view
 */
function RedirectToEdit() {
  const { id } = useParams();
  return <Navigate to={`/photos/${id}/edit`} replace />;
}

/**
 * App - Root component with routing and error boundary
 * 
 * Route structure:
 * - / : SmartRouter (determines initial landing based on photo state)
 * - /gallery : PhotoGalleryPage (with ?view=working|inprogress|finished)
 * - /upload : Dedicated upload page
 * - /photos/:id : Redirects to /photos/:id/edit
 * - /photos/:id/edit : Photo edit view (modern editor)
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
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<AuthWrapper><MainLayout /></AuthWrapper>}>
            {/* Smart Router - determines initial landing page based on photo state */}
            <Route index element={<SmartRouter />} />
            
            {/* Gallery view with query param support (?view=working|inprogress|finished) */}
            <Route path="/gallery" element={<PhotoGalleryPage />} />
            
            {/* Dedicated upload page */}
            <Route path="/upload" element={<UploadPage />} />
            
            {/* Settings page */}
            <Route path="/settings" element={<SettingsPage />} />
            
            {/* Photo detail view - redirects to edit */}
            <Route path="/photos/:id" element={<RedirectToEdit />} />
            
            {/* Photo edit view */}
            <Route path="/photos/:id/edit" element={<PhotoEditPage />} />
            
            {/* Catch-all redirect to SmartRouter */}
            <Route path="*" element={<SmartRouter />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </GlobalErrorBoundary>
  );
}

export default App;
