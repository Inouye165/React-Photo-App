import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

function getConfiguredSupabaseHostname(): string | null {
  try {
    const raw =
      typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
        ? String(import.meta.env.VITE_SUPABASE_URL)
        : '';
    if (!raw) return null;
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAllowedSupabaseVerifyUrl(url: URL, configuredSupabaseHostname: string | null): boolean {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

  const hostname = url.hostname.toLowerCase();
  const allowedHost = configuredSupabaseHostname
    ? hostname === configuredSupabaseHostname
    : hostname.endsWith('.supabase.co') || hostname.endsWith('.supabase.in');

  if (!allowedHost) return false;
  if (!url.pathname.includes('/auth/v1/verify')) return false;

  return true;
}

export default function ConfirmInvitePage() {
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  const confirmationUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get('confirmation_url');
    if (!raw) return null;

    // Email templates should URL-encode the confirmation URL before embedding it.
    // We still try to decode here to support both encoded and plain values.
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      // best-effort
    }

    let url: URL;
    try {
      url = new URL(decoded);
    } catch {
      return null;
    }

    const configuredSupabaseHostname = getConfiguredSupabaseHostname();
    if (!isAllowedSupabaseVerifyUrl(url, configuredSupabaseHostname)) return null;

    // If the confirmation URL is a Supabase verify link for an invite/recovery,
    // force redirect_to to our reset-password route.
    // This makes the post-verify landing page deterministic even if the Supabase
    // project Site URL is set to the root.
    try {
      const verificationType = url.searchParams.get('type');
      const isVerifyEndpoint = url.pathname.includes('/auth/v1/verify');

      if (isVerifyEndpoint && (verificationType === 'invite' || verificationType === 'recovery')) {
        const origin = typeof window !== 'undefined' ? window.location.origin : null;
        if (origin) {
          url.searchParams.set('redirect_to', `${origin}/reset-password`);
          return url.toString();
        }
      }
    } catch {
      // If it's not a valid URL, just pass it through.
    }

    return url.toString();
  }, [location.search]);

  const onContinue = () => {
    setError(null);
    if (!confirmationUrl) {
      setError('Missing invite link. Please request a new invitation email.');
      return;
    }

    try {
      window.location.assign(confirmationUrl);
    } catch {
      setError('Unable to open the invite link. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Accept your invite</h1>
        <p className="text-slate-600 text-sm mb-6">
          Some email providers scan links automatically, which can expire one-time invite URLs.
          Click the button below to continue.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!confirmationUrl && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Invite link is missing or malformed.
          </div>
        )}

        <button
          type="button"
          onClick={onContinue}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-white font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!confirmationUrl}
        >
          Continue
        </button>

        <a
          href="/"
          className="mt-4 block text-center text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          Back to home
        </a>
      </div>
    </div>
  );
}
