
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';

// Strictly typed props (none expected)
interface JoinPageProps {}

type JoinStatus = 'verifying' | 'success' | 'error';

function parseHashParams(hash: string): URLSearchParams {
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(trimmed);
}

const JoinPage: React.FC<JoinPageProps> = () => {
  const [status, setStatus] = useState<JoinStatus>('verifying');
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string>(() => window.location.hash);

  const hasAccessToken = useMemo(() => hash.includes('access_token'), [hash]);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      setStatus('verifying');
      setError(null);

      if (!hasAccessToken) {
        setStatus('error');
        setError('Invalid or expired invite link.');
        return;
      }

      const params = parseHashParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken) {
        setStatus('error');
        setError('Invalid or expired invite link.');
        return;
      }

      try {
        // Preferred: let supabase-js parse and store session from URL hash
        if (typeof (supabase as any)?.auth?.getSessionFromUrl === 'function') {
          const result = await (supabase as any).auth.getSessionFromUrl({ storeSession: true });
          if (result?.error) {
            throw result.error;
          }
          const sessionAccessToken: unknown = result?.data?.session?.access_token;
          if (typeof sessionAccessToken !== 'string' || sessionAccessToken.length === 0) {
            throw new Error('No session created from invite link');
          }
        } else if (typeof (supabase as any)?.auth?.setSession === 'function') {
          // Fallback for environments where getSessionFromUrl is unavailable
          await (supabase as any).auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken ?? '',
          });
        } else {
          throw new Error('Supabase auth helpers unavailable');
        }

        // Security: remove tokens from URL
        try {
          window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
        } catch {
          // best-effort
        }

        if (!cancelled) {
          setStatus('success');
          setError(null);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to verify invite link.';
        if (!cancelled) {
          setStatus('error');
          setError(message);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [hash, hasAccessToken]);

  if (status === 'verifying') return <div>Verifying invite link...</div>;
  if (status === 'error') return <div style={{ color: 'red' }}>{error ?? 'Invalid or expired invite link.'}</div>;

  return (
    <div>
      <h1>Welcome! Your invite is valid.</h1>
      <p>You can now continue to the app.</p>
    </div>
  );
};

export default JoinPage;
