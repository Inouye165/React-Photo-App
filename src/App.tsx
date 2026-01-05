import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { logGlobalError } from './utils/globalLog';
import GlobalErrorBoundary from './components/GlobalErrorBoundary.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import SmartRouter from './components/SmartRouter.tsx';
import IdentityGate from './components/IdentityGate.tsx';
import PhotoGalleryPage from './pages/PhotoGalleryPage.jsx';
import PhotoDetailPage from './pages/PhotoDetailPage.tsx';
import PhotoEditPage from './pages/PhotoEditPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import AuthWrapper from './layouts/AuthWrapper';
import ConfirmInvitePage from './pages/ConfirmInvitePage';
import OnboardingPage from './pages/OnboardingPage.tsx';
import ChatPage from './pages/ChatPage.tsx';
import AdminDashboard from './pages/AdminDashboard.tsx';
import AdminAssessmentHistory from './pages/AdminAssessmentHistory.tsx';
import AssessmentReviewDetail from './pages/AssessmentReviewDetail.tsx';

declare global {
  interface Window {
    logGlobalError?: typeof logGlobalError;
  }
}

/**
 * App - Root component with routing and error boundary
 *
 * Route structure:
 * - / : SmartRouter (determines initial landing based on photo state)
 * - /gallery : PhotoGalleryPage (unified gallery)
 * - /upload : Dedicated upload page
 * - /photos/:id : Photo detail view (read-only)
 * - /photos/:id/edit : Photo edit view (modern editor)
 */
function App(): JSX.Element {
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
          <Route path="/confirm-invite" element={<ConfirmInvitePage />} />
          <Route path="/reset-password" element={<OnboardingPage />} />
          <Route element={<AuthWrapper><IdentityGate /></AuthWrapper>}>
            <Route element={<MainLayout />}>
              {/* Smart Router - determines initial landing page based on photo state */}
              <Route index element={<SmartRouter />} />

              {/* Unified gallery view */}
              <Route path="/gallery" element={<PhotoGalleryPage />} />

              {/* Dedicated upload page */}
              <Route path="/upload" element={<UploadPage />} />

              {/* Settings page */}
              <Route path="/settings" element={<SettingsPage />} />

              {/* Admin dashboard - protected route */}
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/assessments" element={<AdminAssessmentHistory />} />
              <Route path="/admin/assessments/:id" element={<AssessmentReviewDetail />} />

              {/* Community chat */}
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/chat/:roomId" element={<ChatPage />} />

              {/* Photo detail view */}
              <Route path="/photos/:id" element={<PhotoDetailPage />} />

              {/* Photo edit view */}
              <Route path="/photos/:id/edit" element={<PhotoEditPage />} />

              {/* Catch-all redirect to SmartRouter */}
              <Route path="*" element={<SmartRouter />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </GlobalErrorBoundary>
  );
}

export default App;
