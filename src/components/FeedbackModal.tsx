import { useState } from 'react';
import { X, Send, AlertCircle, CheckCircle } from 'lucide-react';
import { request } from '../api/httpClient';

interface FeedbackModalProps {
  onClose: () => void;
}

type FeedbackType = 'suggestion' | 'bug' | 'question' | 'other';

/**
 * FeedbackModal - Modal for submitting app-wide feedback/suggestions to admin
 * 
 * This is for general app feedback, not photo-specific comments.
 * Feedback is stored in the comments table with photoId = null.
 */
export default function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('suggestion');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const MAX_LENGTH = 2000;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double-submit while a request is in-flight.
    if (isSubmitting) return;
    
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError('Please enter your feedback');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await request<{ success: boolean; error?: string }>({
        path: '/api/feedback',
        method: 'POST',
        body: {
          type: feedbackType,
          content: trimmedContent,
        },
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setError('Failed to submit feedback');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit feedback. Please try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const feedbackTypes: { value: FeedbackType; label: string; emoji: string }[] = [
    { value: 'suggestion', label: 'Suggestion', emoji: '💡' },
    { value: 'bug', label: 'Bug Report', emoji: '🐛' },
    { value: 'question', label: 'Question', emoji: '❓' },
    { value: 'other', label: 'Other', emoji: '📝' },
  ];

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        className="w-full max-w-md bg-white rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-labelledby="feedback-modal-title"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id="feedback-modal-title" className="text-lg font-semibold text-slate-900">
            Send Feedback
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 text-slate-400 hover:text-slate-600 
                       hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {success ? (
          /* Success State */
          <div className="px-6 py-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              Thank you for your feedback!
            </h3>
            <p className="text-sm text-slate-500">
              We appreciate you taking the time to help us improve.
            </p>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-4 space-y-4">
              {/* Feedback Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Type of Feedback
                </label>
                <div className="flex flex-wrap gap-2">
                  {feedbackTypes.map(({ value, label, emoji }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFeedbackType(value)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
                                  border transition-all ${
                                    feedbackType === value
                                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                  }`}
                    >
                      <span>{emoji}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Content */}
              <div>
                <label 
                  htmlFor="feedback-content"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Your Feedback
                </label>
                <textarea
                  id="feedback-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Tell us what you think, report a bug, or suggest an improvement..."
                  maxLength={MAX_LENGTH}
                  rows={5}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg
                             text-sm text-slate-900 placeholder:text-slate-400
                             focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                             resize-none transition-shadow"
                  autoFocus
                />
                <div className="flex justify-end mt-1">
                  <span className={`text-xs ${
                    content.length > MAX_LENGTH * 0.9 ? 'text-amber-600' : 'text-slate-400'
                  }`}>
                    {content.length}/{MAX_LENGTH}
                  </span>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 
                           hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !content.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium
                           text-white bg-blue-600 hover:bg-blue-700
                           disabled:bg-slate-300 disabled:cursor-not-allowed
                           rounded-lg transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send Feedback
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
