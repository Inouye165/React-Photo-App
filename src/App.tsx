import { useEffect } from 'react';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { logGlobalError } from './utils/globalLog';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import MainLayout from './layouts/MainLayout';
import IdentityGate from './components/IdentityGate.tsx';
import HomePage from './pages/HomePage';
import PhotoGalleryPage from './pages/PhotoGalleryPage';
import PhotoDetailPage from './pages/PhotoDetailPage.tsx';
import PhotoEditPage from './pages/PhotoEditPage.tsx';
import CollectiblePhotoPage from './pages/CollectiblePhotoPage.tsx';
import UploadPage from './pages/UploadPage.tsx';
import SettingsPage from './pages/SettingsPage.tsx';
import AuthWrapper from './layouts/AuthWrapper';
import ConfirmInvitePage from './pages/ConfirmInvitePage';
import OnboardingPage from './pages/OnboardingPage.tsx';
import ChatPage from './pages/ChatPage.tsx';
import ChatPadPage from './pages/ChatPadPage.tsx';
import GamesIndex from './pages/GamesIndex'
import ChessGame from './pages/ChessGame'
import ChessHub from './pages/ChessHub'
import AdminDashboard from './pages/AdminDashboard.tsx';
import AdminAssessmentHistory from './pages/AdminAssessmentHistory.tsx';
import AssessmentReviewDetail from './pages/AssessmentReviewDetail.tsx';
import useBuildGuard from './hooks/useBuildGuard';

declare global {
  interface Window {
    logGlobalError?: typeof logGlobalError;
  }
}

/**
 * App - Root component with routing and error boundary
 *
 * Route structure:
 * - / : Home page
 * - /gallery : PhotoGalleryPage (unified gallery)
 * - /upload : Dedicated upload page
 * - /photos/:id : Photo detail view (read-only)
 * - /photos/:id/edit : Photo edit view (modern editor)
 */
function App() {
  useBuildGuard();

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
            <Route path="/chat/:roomId/pad" element={<ChatPadPage />} />
            <Route element={<MainLayout />}>
              <Route index element={<HomePage />} />

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

              {/* Games */}
              <Route path="/games" element={<GamesIndex />} />
              <Route path="/games/chess" element={<ChessHub />} />
              <Route path="/games/:gameId" element={<ChessGame />} />

              {/* Photo detail view */}
              <Route path="/photos/:id" element={<PhotoDetailPage />} />

              {/* Photo edit view */}
              <Route path="/photos/:id/edit" element={<PhotoEditPage />} />

              {/* Collectible detail view (main + reference carousel) */}
              <Route path="/collectibles/photos/:id" element={<CollectiblePhotoPage />} />

              {/* Catch-all redirect to Home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </GlobalErrorBoundary>
  );
}

export default App;
