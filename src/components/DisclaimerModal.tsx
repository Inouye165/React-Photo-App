import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { Lock, Server, Sparkles } from 'lucide-react'

export interface DisclaimerModalProps {
  onAccept: () => void
  onDeny: () => void
  isAccepting?: boolean
}

/**
 * DisclaimerModal - Blocking modal requiring users to accept experimental terms
 * 
 * Design: Clean, professional, Google-style disclaimer with clear privacy warnings.
 * Features:
 * - Non-dismissible (no close button, backdrop click disabled)
 * - Clear data privacy warnings
 * - Checkbox confirmation required before enabling accept button
 * - Professional styling matching app aesthetic
 */
export default function DisclaimerModal({ onAccept, onDeny, isAccepting = false }: DisclaimerModalProps) {
  const [hasReadAndUnderstood, setHasReadAndUnderstood] = useState(false)

  const handleAccept = () => {
    if (hasReadAndUnderstood && !isAccepting) {
      onAccept()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm transition-opacity">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all scale-100 flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Brand Header with Background Image */}
        <div className="relative h-32 w-full bg-slate-900 overflow-hidden shrink-0">
          <div className="absolute inset-0 opacity-60">
            <img
              src="/vaultage-bg.png"
              alt="Lumina Background"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 to-transparent" />

          {/* Brand Content Overlay */}
          <div className="absolute bottom-0 left-0 p-6 w-full">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg">
                <span className="text-xl">📷</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight leading-none" id="modal-title">
                  Lumina
                </h2>
                <p className="text-xs text-blue-200 font-medium uppercase tracking-wider mt-1">
                  Experimental Preview
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="px-6 py-6 space-y-5 overflow-y-auto">
          <p className="text-slate-600 text-sm leading-relaxed">
            Welcome! You're joining a beta version of our family hub — for sharing photos, planning gatherings, learning together, and playing games.
          </p>

          {/* --- Existing Sections: AI, Security, Warning --- */}
          <div className="flex gap-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900 mb-1">Smart Organization &amp; Features</h3>
              <p className="text-sm text-amber-800">
                We analyze photos to surface helpful information — for example, likely locations, scenery tags, and suggested albums. This metadata helps keep your family library organized and improves search, maps, and sharing suggestions. Processed data is stored securely to power these convenience features.
              </p>
            </div>
          </div>
          <div className="flex gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <Lock className="w-5 h-5 text-slate-700 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Security &amp; Privacy</h3>
              <p className="text-sm text-slate-700">
                We use industry-standard encryption. <strong>We do not see or store your passwords.</strong> Authentication is handled securely by our identity provider. We cannot decrypt or access your private credentials.
              </p>
            </div>
          </div>
          <div className="flex gap-4 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
            <Server className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">Data Recovery Warning</h3>
              <p className="text-sm text-blue-800">
                As a work-in-progress, <strong>data recovery is NOT available.</strong> If you delete a photo, it is permanently removed. Please do not upload sensitive personal documents (e.g., financial/medical records) at this time.
              </p>
            </div>
          </div>
          {/* Acknowledgment Section */}
          <div className="pt-4 border-t border-slate-200">
            <p className="text-sm text-slate-600 mb-4">
              By accepting, you confirm that you've read these notes and agree to use this beta release. Your consent enables features like shared albums, event planning, and in-app helpers.
            </p>
            {/* Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={hasReadAndUnderstood}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setHasReadAndUnderstood(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 cursor-pointer"
                disabled={isAccepting}
              />
              <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 select-none">
                I have read and understand the notes above, and I accept the risks of using this beta release.
              </span>
            </label>
          </div>
        </div>

        {/* Footer Actions (With Decline Option) */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 shrink-0 flex justify-between items-center">
          <button
            onClick={onDeny}
            className="px-4 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 text-sm font-medium rounded-lg transition-colors"
          >
            Decline & Sign Out
          </button>
          <button
            onClick={handleAccept}
            disabled={!hasReadAndUnderstood || isAccepting}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 active:bg-black text-white text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isAccepting ? 'Saving...' : 'I Understand & Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}
