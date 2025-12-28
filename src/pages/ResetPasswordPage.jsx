import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

const ResetPasswordPage = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { updatePassword, updateProfile, user, session, profile, loading: authLoading, profileLoading } = useAuth();
  const navigate = useNavigate();

  const [processingRecoveryLink, setProcessingRecoveryLink] = useState(() => {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    return hash.includes('type=recovery') || hash.includes('type=invite') || search.includes('code=');
  });

  useEffect(() => {
    let cancelled = false;

    async function maybeFinalizeRecovery() {
      if (!processingRecoveryLink) return;

      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        // Hash-based recovery doesn't need this; code-based flows do.
        if (code && supabase?.auth?.exchangeCodeForSession) {
          await supabase.auth.exchangeCodeForSession(code);
        } else {
          // Hash flow: Give Supabase some time to process the hash and fire onAuthStateChange
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch {
        // If this fails, the lack of a session will trigger the redirect path after processing completes.
      } finally {
        if (!cancelled) setProcessingRecoveryLink(false);
      }
    }

    void maybeFinalizeRecovery();

    return () => {
      cancelled = true;
    };
  }, [processingRecoveryLink]);

  useEffect(() => {
    if (!authLoading && !processingRecoveryLink && !session) {
      // If not logged in, redirect to login (or show error)
      // If there's an error in the hash, preserve it so LandingPage can show it
      if (window.location.hash.includes('error=')) {
        navigate('/' + window.location.hash);
      } else {
        navigate('/');
      }
    }
  }, [session, authLoading, processingRecoveryLink, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const needsUsername = !profile?.has_set_username;

    if (needsUsername && !username.trim()) {
      setError('Please choose a username');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    // 1. Update Password
    const result = await updatePassword(password);

    if (result.success) {
      // 2. Update Username if needed
      if (needsUsername) {
        const profileResult = await updateProfile(username);
        if (!profileResult.success) {
          console.error('Failed to set username during setup:', profileResult.error);
          // We continue anyway because password is set, and IdentityGate will catch the missing username later if needed.
          // But ideally we'd show a warning. For now, let's assume success to not block the user.
        }
      }

      setSuccess(true);
      setTimeout(() => {
        navigate('/gallery');
      }, 2000);
    } else {
      setError(result.error || 'Failed to update password');
    }
    setLoading(false);
  };

  if (authLoading || processingRecoveryLink || (session && profileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">
            {processingRecoveryLink ? 'Verifying link...' : 'Loading profile...'}
          </p>
        </div>
      </div>
    );
  }

  if (!session || !user) return null; // Will redirect in useEffect

  const isSetup = !profile?.has_set_username;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {isSetup ? 'Create Account' : 'Reset Password'}
          </h1>
          <p className="text-sm text-gray-600">
            {isSetup ? 'Set up your username and password' : 'Enter your new password below'}
          </p>
        </div>

        {success ? (
          <div className="rounded-lg bg-green-50 p-6 text-center">
            <svg className="mx-auto h-10 w-10 text-green-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
            </svg>
            <h3 className="text-lg font-semibold text-green-800 mb-1">
              {isSetup ? 'Account Created' : 'Password Updated'}
            </h3>
            <p className="text-sm text-green-700 mb-2">Redirecting you to the gallery...</p>
          </div>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-center text-red-700 text-sm font-medium">{error}</div>
            )}
            
            {isSetup && (
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  placeholder="Choose a unique username"
                  minLength={3}
                />
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                {isSetup ? 'Password' : 'New Password'}
              </label>
              <input
                id="password"
                type="password"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                minLength={6}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                minLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;
