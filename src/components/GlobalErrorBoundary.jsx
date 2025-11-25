import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';

/**
 * Fallback component displayed when an error is caught
 */
function ErrorFallback({ error, resetErrorBoundary }) {
  const handleGoHome = () => {
    resetErrorBoundary();
    // Use window.location for navigation to avoid Router dependency
    window.location.href = '/';
  };

  return (
    <div 
      role="alert"
      className="min-h-screen flex items-center justify-center bg-gray-50 px-4"
    >
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="flex items-center justify-center w-16 h-16 mx-auto bg-red-100 rounded-full mb-4">
          <svg 
            className="w-8 h-8 text-red-600" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 text-center mb-4">
          Something went wrong
        </h1>

        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <p className="text-sm text-red-800 font-mono break-words">
            {error?.message || 'An unexpected error occurred'}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={resetErrorBoundary}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-medium"
          >
            Try Again
          </button>
          <button
            onClick={handleGoHome}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors font-medium"
          >
            Go Home
          </button>
        </div>

        {import.meta.env.DEV && error?.stack && (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
              View stack trace
            </summary>
            <pre className="mt-2 text-xs bg-gray-100 p-3 rounded overflow-auto max-h-64 text-gray-800">
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

/**
 * Global Error Boundary wrapper
 * Catches errors anywhere in the component tree and displays a fallback UI
 */
export default function GlobalErrorBoundary({ children }) {
  const handleError = (error, errorInfo) => {
    // Log to console
    console.error('Global Error Boundary caught an error:', error, errorInfo);

    // In production, you might want to send this to an error tracking service
    if (!import.meta.env.DEV) {
      // Example: Sentry, LogRocket, etc.
      // Sentry.captureException(error, { contexts: { react: errorInfo } });
    }
  };

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={handleError}
      onReset={() => {
        // Reset any app state if needed
        window.location.href = '/';
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
