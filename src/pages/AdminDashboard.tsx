/**
 * AdminDashboard - Administrative management interface
 * 
 * Features:
 * - Tabbed interface: Invites and Suggestions Review
 * - Invite users via email using Supabase Admin API
 * - Review AI-generated photo metadata
 * 
 * SECURITY:
 * - Protected route (admin role required)
 * - Email validation on frontend before submission
 * - All API calls include JWT Bearer token
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Users, Sparkles, Mail, CheckCircle, XCircle, AlertCircle, MessageSquare } from 'lucide-react';
import { getAuthHeadersAsync } from '../api/auth';
import { request } from '../api/httpClient';

interface PhotoSuggestion {
  id: string;
  user_id: string;
  filename: string;
  ai_generated_metadata: Record<string, unknown> | null;
  state: string;
  created_at: string;
  updated_at: string;
}

interface InviteResponse {
  success: boolean;
  data?: {
    user: unknown;
    email_sent: boolean;
  };
  error?: string;
}

interface SuggestionsResponse {
  success: boolean;
  data?: PhotoSuggestion[];
  total?: number;
  limit?: number;
  offset?: number;
  error?: string;
}

interface AdminComment {
  id: number;
  photo_id: number;
  user_id: string;
  content: string;
  is_reviewed: boolean;
  created_at: string;
  updated_at: string;
  username: string | null;
  filename: string | null;
}

interface CommentsResponse {
  success: boolean;
  data?: AdminComment[];
  total?: number;
  limit?: number;
  offset?: number;
  error?: string;
}

interface ReviewCommentResponse {
  success: boolean;
  data?: AdminComment;
  error?: string;
}

interface AdminFeedbackMessage {
  id: string;
  message: string;
  category: string | null;
  status: string;
  url: string | null;
  context: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

interface FeedbackResponse {
  success: boolean;
  data?: AdminFeedbackMessage[];
  total?: number;
  limit?: number;
  offset?: number;
  error?: string;
}

type TabType = 'invites' | 'suggestions' | 'comments' | 'feedback';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('invites');
  
  // Invites tab state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Suggestions tab state
  const [suggestions, setSuggestions] = useState<PhotoSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string>('');
  const [total, setTotal] = useState(0);

  // Comments tab state
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [reviewedFilter, setReviewedFilter] = useState<string>('');
  const [commentsTotal, setCommentsTotal] = useState(0);

  // Feedback tab state
  const [feedback, setFeedback] = useState<AdminFeedbackMessage[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState<string>('');
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [feedbackOffset, setFeedbackOffset] = useState(0);
  const feedbackLimit = 50;

  // Verify admin role
  const isAdmin = user?.app_metadata?.role === 'admin';

  useEffect(() => {
    if (activeTab === 'suggestions') {
      fetchSuggestions();
    }
    if (activeTab === 'comments') {
      fetchComments();
    }
    if (activeTab === 'feedback') {
      fetchFeedback({ offset: 0, append: false });
    }
  }, [activeTab, stateFilter, reviewedFilter, feedbackStatusFilter]);

  const fetchFeedback = async ({ offset, append }: { offset: number; append: boolean }) => {
    setFeedbackLoading(true);
    setFeedbackError(null);

    try {
      const headers = await getAuthHeadersAsync(false);

      const query: Record<string, string> = {
        limit: String(feedbackLimit),
        offset: String(offset),
      };

      if (feedbackStatusFilter) {
        query.status = feedbackStatusFilter;
      }

      const data = await request<FeedbackResponse>({
        path: '/api/admin/feedback',
        method: 'GET',
        query,
        headers,
      });

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch feedback');
      }

      const rows = data.data || [];
      setFeedback(prev => (append ? [...prev, ...rows] : rows));
      setFeedbackTotal(data.total || 0);
      setFeedbackOffset((data.offset || offset) + (data.limit || feedbackLimit));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load feedback';
      setFeedbackError(message);
      console.error('[admin] Fetch feedback error:', err);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const fetchSuggestions = async () => {
    setSuggestionsLoading(true);
    setSuggestionsError(null);

    try {
      const headers = await getAuthHeadersAsync(false);

      const query: Record<string, string> = {
        limit: '50',
        offset: '0'
      };
      
      if (stateFilter) {
        query.state = stateFilter;
      }

      const data = await request<SuggestionsResponse>({
        path: '/api/admin/suggestions',
        method: 'GET',
        query,
        headers
      });

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch suggestions');
      }

      setSuggestions(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load suggestions';
      setSuggestionsError(message);
      console.error('[admin] Fetch suggestions error:', err);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const fetchComments = async () => {
    setCommentsLoading(true);
    setCommentsError(null);

    try {
      const headers = await getAuthHeadersAsync(false);

      const query: Record<string, string> = {
        limit: '50',
        offset: '0'
      };

      if (reviewedFilter) {
        query.is_reviewed = reviewedFilter;
      }

      const data = await request<CommentsResponse>({
        path: '/api/admin/comments',
        method: 'GET',
        query,
        headers
      });

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch comments');
      }

      setComments(data.data || []);
      setCommentsTotal(data.total || 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load comments';
      setCommentsError(message);
      console.error('[admin] Fetch comments error:', err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleMarkReviewed = async (commentId: number) => {
    try {
      const headers = await getAuthHeadersAsync(false);

      const data = await request<ReviewCommentResponse>({
        path: `/api/admin/comments/${commentId}/review`,
        method: 'PATCH',
        headers
      });

      if (!data.success) {
        throw new Error(data.error || 'Failed to mark comment as reviewed');
      }

      // Update local state
      setComments(prev =>
        prev.map(c => (c.id === commentId ? { ...c, is_reviewed: true } : c))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update comment';
      console.error('[admin] Review comment error:', err);
      alert(message);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteMessage(null);

    // Validate email format
    const trimmedEmail = inviteEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setInviteMessage({ type: 'error', text: 'Please enter a valid email address' });
      return;
    }

    setInviteLoading(true);

    try {
      const headers = await getAuthHeadersAsync(false);

      const data = await request<InviteResponse>({
        path: '/api/admin/invite',
        method: 'POST',
        headers,
        body: { email: trimmedEmail }
      });

      if (!data.success) {
        throw new Error(data.error || 'Failed to send invitation');
      }

      setInviteMessage({ type: 'success', text: `Invitation sent to ${trimmedEmail}` });
      setInviteEmail('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send invitation';
      setInviteMessage({ type: 'error', text: message });
      console.error('[admin] Invite error:', err);
    } finally {
      setInviteLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">
            You do not have permission to access the admin dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
            <p className="text-gray-600">Manage users and review AI-generated content</p>
          </div>
          <Link
            to="/admin/assessments"
            className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Assessments
          </Link>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('invites')}
                className={`
                  flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors
                  ${activeTab === 'invites'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Users size={18} />
                <span>Invites</span>
              </button>
              <button
                onClick={() => setActiveTab('suggestions')}
                className={`
                  flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors
                  ${activeTab === 'suggestions'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Sparkles size={18} />
                <span>Suggestions Review</span>
              </button>
              <button
                onClick={() => setActiveTab('comments')}
                className={`
                  flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors
                  ${activeTab === 'comments'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <MessageSquare size={18} />
                <span>Comments</span>
              </button>
              <button
                onClick={() => setActiveTab('feedback')}
                className={`
                  flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors
                  ${activeTab === 'feedback'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <MessageSquare size={18} />
                <span>Feedback</span>
              </button>
            </nav>
          </div>

          <div className="p-6">
            {/* Invites Tab */}
            {activeTab === 'invites' && (
              <div className="max-w-2xl">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Invite New User</h2>
                <p className="text-gray-600 mb-6">
                  Send an email invitation to a new user. They'll receive a link to set up their account.
                </p>

                <form onSubmit={handleInviteSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <div className="flex gap-3">
                      <input
                        id="invite-email"
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="user@example.com"
                        required
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        disabled={inviteLoading}
                      />
                      <button
                        type="submit"
                        disabled={inviteLoading}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Mail size={18} />
                        <span>{inviteLoading ? 'Sending...' : 'Send Invite'}</span>
                      </button>
                    </div>
                  </div>

                  {inviteMessage && (
                    <div
                      className={`
                        flex items-center gap-2 p-4 rounded-lg
                        ${inviteMessage.type === 'success'
                          ? 'bg-green-50 text-green-800 border border-green-200'
                          : 'bg-red-50 text-red-800 border border-red-200'
                        }
                      `}
                    >
                      {inviteMessage.type === 'success' ? (
                        <CheckCircle size={20} />
                      ) : (
                        <XCircle size={20} />
                      )}
                      <span className="text-sm">{inviteMessage.text}</span>
                    </div>
                  )}
                </form>
              </div>
            )}

            {/* Suggestions Tab */}
            {activeTab === 'suggestions' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">AI Suggestions Review</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {total} photo{total !== 1 ? 's' : ''} with AI-generated metadata
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <label htmlFor="state-filter" className="text-sm font-medium text-gray-700">
                      Filter:
                    </label>
                    <select
                      id="state-filter"
                      value={stateFilter}
                      onChange={(e) => setStateFilter(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">All States</option>
                      <option value="analyzed">Analyzed</option>
                      <option value="pending">Pending</option>
                      <option value="uploaded">Uploaded</option>
                    </select>
                  </div>
                </div>

                {suggestionsLoading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
                    <p className="mt-4 text-gray-600">Loading suggestions...</p>
                  </div>
                ) : suggestionsError ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
                    <p className="font-medium">Error loading suggestions</p>
                    <p className="text-sm mt-1">{suggestionsError}</p>
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Sparkles className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No AI-generated suggestions found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {suggestions.map((photo) => (
                      <div key={photo.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-medium text-gray-900">{photo.filename}</h3>
                            <p className="text-sm text-gray-500">
                              State: <span className="font-medium">{photo.state}</span> • 
                              Updated: {new Date(photo.updated_at).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                            AI Generated
                          </span>
                        </div>
                        
                        {photo.ai_generated_metadata && (
                          <div className="bg-white rounded border border-gray-200 p-3">
                            <p className="text-xs font-medium text-gray-700 mb-2">AI Metadata:</p>
                            <pre className="text-xs text-gray-600 overflow-x-auto">
                              {JSON.stringify(photo.ai_generated_metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Comments Tab */}
            {activeTab === 'comments' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Comment Moderation</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {commentsTotal} comment{commentsTotal !== 1 ? 's' : ''} to review
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <label htmlFor="reviewed-filter" className="text-sm font-medium text-gray-700">
                      Filter:
                    </label>
                    <select
                      id="reviewed-filter"
                      value={reviewedFilter}
                      onChange={(e) => setReviewedFilter(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">All Comments</option>
                      <option value="false">Pending Review</option>
                      <option value="true">Reviewed</option>
                    </select>
                  </div>
                </div>

                {commentsLoading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
                    <p className="mt-4 text-gray-600">Loading comments...</p>
                  </div>
                ) : commentsError ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
                    <p className="font-medium">Error loading comments</p>
                    <p className="text-sm mt-1">{commentsError}</p>
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <MessageSquare className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No comments found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-medium text-gray-900">
                              {comment.username || 'Anonymous'} on {comment.filename || `Photo #${comment.photo_id}`}
                            </h3>
                            <p className="text-sm text-gray-500">
                              {new Date(comment.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {comment.is_reviewed ? (
                              <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full flex items-center gap-1">
                                <CheckCircle size={14} />
                                Reviewed
                              </span>
                            ) : (
                              <button
                                onClick={() => handleMarkReviewed(comment.id)}
                                className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full hover:bg-blue-200 transition-colors"
                              >
                                Mark Reviewed
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="bg-white rounded border border-gray-200 p-3">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                            {comment.content}
                          </p>
                        </div>

                        <div className="mt-2 flex gap-2">
                          <Link
                            to={`/photos/${comment.photo_id}`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            View Photo →
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Feedback Tab */}
            {activeTab === 'feedback' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Feedback Moderation</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {feedbackTotal} message{feedbackTotal !== 1 ? 's' : ''} submitted by users
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <label htmlFor="feedback-status-filter" className="text-sm font-medium text-gray-700">
                      Filter:
                    </label>
                    <select
                      id="feedback-status-filter"
                      value={feedbackStatusFilter}
                      onChange={(e) => setFeedbackStatusFilter(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">All Statuses</option>
                      <option value="new">New</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                </div>

                {feedbackLoading && feedback.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
                    <p className="mt-4 text-gray-600">Loading feedback...</p>
                  </div>
                ) : feedbackError ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
                    <p className="font-medium">Error loading feedback</p>
                    <p className="text-sm mt-1">{feedbackError}</p>
                  </div>
                ) : feedback.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <MessageSquare className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No feedback messages found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {feedback.map((item) => (
                      <div key={item.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-start justify-between mb-3 gap-4">
                          <div className="min-w-0">
                            <h3 className="font-medium text-gray-900 truncate">
                              {item.category ? item.category : 'General'}
                            </h3>
                            <p className="text-sm text-gray-500">
                              Status: <span className="font-medium">{item.status}</span> •
                              Submitted: {new Date(item.created_at).toLocaleString()}
                            </p>
                            {item.url && (
                              <p className="text-xs text-gray-500 mt-1 break-all">
                                URL: {item.url}
                              </p>
                            )}
                          </div>

                          <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                            Feedback
                          </span>
                        </div>

                        {/* XSS: Render as plain text (React escapes by default). */}
                        <div className="bg-white rounded border border-gray-200 p-3">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                            {item.message}
                          </p>
                        </div>

                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                          <div className="break-all">IP: {item.ip_address || '—'}</div>
                          <div className="break-all">UA: {item.user_agent || '—'}</div>
                        </div>

                        {item.context != null && (
                          <div className="mt-3 bg-white rounded border border-gray-200 p-3">
                            <p className="text-xs font-medium text-gray-700 mb-2">Context:</p>
                            <pre className="text-xs text-gray-600 overflow-x-auto">
                              {typeof item.context === 'string'
                                ? item.context
                                : JSON.stringify(item.context, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}

                    {feedback.length < feedbackTotal && (
                      <div className="pt-2">
                        <button
                          onClick={() => fetchFeedback({ offset: feedbackOffset, append: true })}
                          disabled={feedbackLoading}
                          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {feedbackLoading ? 'Loading…' : 'Load more'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
