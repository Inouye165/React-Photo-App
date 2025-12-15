import React, { useState } from 'react';
import { AlertTriangle, Shield, Database, Info } from 'lucide-react';

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
export default function DisclaimerModal({ onAccept, isAccepting = false }) {
  const [hasReadAndUnderstood, setHasReadAndUnderstood] = useState(false);

  const handleAccept = () => {
    if (hasReadAndUnderstood && !isAccepting) {
      onAccept();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        style={{
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-slate-200">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-10 h-10 text-amber-500" strokeWidth={2} />
            </div>
            <div>
              <h2 
                id="disclaimer-title"
                className="text-2xl font-bold text-slate-900 mb-2"
              >
                Experimental Feature Notice
              </h2>
              <p className="text-slate-600">
                Please read and accept the following terms before continuing
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6 space-y-6">
          {/* Beta Warning */}
          <div className="flex gap-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900 mb-1">Beta Software</h3>
              <p className="text-sm text-amber-800">
                This application is in active development and may contain bugs or incomplete features. 
                Use at your own discretion.
              </p>
            </div>
          </div>

          {/* Data Privacy Warning */}
          <div className="flex gap-4 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
            <Database className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">Data Privacy</h3>
              <p className="text-sm text-blue-800 mb-2">
                Your photos and personal data are processed and stored by this application. 
                While we implement security best practices:
              </p>
              <ul className="text-sm text-blue-800 space-y-1 ml-4 list-disc">
                <li>Photos may be analyzed using AI services</li>
                <li>Metadata is extracted and stored in our database</li>
                <li>Do not upload sensitive or confidential images</li>
                <li>Regular backups are recommended</li>
              </ul>
            </div>
          </div>

          {/* Security Notice */}
          <div className="flex gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <Shield className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Security Notice</h3>
              <p className="text-sm text-slate-700">
                This application is provided "as-is" without warranty. We are not responsible for 
                data loss, security breaches, or any damages resulting from use of this software.
              </p>
            </div>
          </div>

          {/* Acknowledgment Section */}
          <div className="pt-4 border-t border-slate-200">
            <p className="text-sm text-slate-600 mb-4">
              By accepting, you acknowledge that you have read and understood these terms and 
              agree to use this experimental software at your own risk.
            </p>

            {/* Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={hasReadAndUnderstood}
                onChange={(e) => setHasReadAndUnderstood(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 cursor-pointer"
                disabled={isAccepting}
              />
              <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 select-none">
                I have read and understood the terms above, and I accept the risks of using 
                this experimental software.
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-slate-50 border-t border-slate-200 rounded-b-3xl">
          <div className="flex items-center justify-end gap-4">
            <button
              onClick={handleAccept}
              disabled={!hasReadAndUnderstood || isAccepting}
              className={`px-8 py-3 rounded-full font-semibold text-white transition-all duration-200 ${
                hasReadAndUnderstood && !isAccepting
                  ? 'bg-indigo-600 hover:bg-indigo-700 shadow-lg hover:shadow-xl'
                  : 'bg-slate-300 cursor-not-allowed'
              }`}
              aria-label="Accept terms and continue"
            >
              {isAccepting ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Accepting...</span>
                </span>
              ) : (
                'Accept and Continue'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
