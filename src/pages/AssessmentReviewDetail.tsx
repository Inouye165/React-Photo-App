import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { request, ApiError } from '../api/httpClient'
import { getAuthHeadersAsync } from '../api/auth'
import { useAuth } from '../contexts/AuthContext'

type AssessmentStatus = 'pending_review' | 'confirmed' | 'rejected'

type AssessmentRow = {
  id: string
  status: AssessmentStatus
  commit_hash: string | null
  final_grade: number | null
  reviewer_id: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  raw_ai_response: unknown
  trace_log: unknown
}

type ParsedAssessment = {
  scores?: Record<string, number>
  final_grade?: number
  overall_summary?: string
  findings?: Array<{ area?: string; title?: string; evidence?: string; impact?: string; recommendation?: string }>
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

export default function AssessmentReviewDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = useMemo(() => user?.app_metadata?.role === 'admin', [user])

  const [row, setRow] = useState<AssessmentRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const parsed: ParsedAssessment | null = useMemo(() => {
    const raw = asObject(row?.raw_ai_response)
    const p = raw?.parsed
    return asObject(p) as ParsedAssessment | null
  }, [row])

  const promptText: string = useMemo(() => {
    const tl = asObject(row?.trace_log)
    const prompt = tl?.prompt
    return typeof prompt === 'string' ? prompt : ''
  }, [row])

  async function load() {
    if (!id) return

    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeadersAsync(false)
      const json = await request<{ success?: boolean; data?: AssessmentRow[]; error?: string }>({
        path: '/api/admin/assessments?limit=100&offset=0',
        method: 'GET',
        headers,
      })
      if (!json?.success) throw new Error(json?.error || 'Failed to load assessment')

      const found = (json.data || []).find((r) => r.id === id) || null
      setRow(found)
      setNotes(found?.notes || '')
      if (!found) setError('Assessment not found in the latest list.')
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message
      setError(msg || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function submit(decision: 'confirmed' | 'rejected') {
    if (!id) return
    if (!user?.id) {
      setError('Missing reviewer id')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const headers = await getAuthHeadersAsync(true)
      const json = await request<{ success?: boolean; data?: AssessmentRow; error?: string }>({
        path: `/api/admin/assessments/${encodeURIComponent(id)}/confirm`,
        method: 'PATCH',
        headers,
        body: { reviewer_id: user.id, notes, decision },
      })
      if (!json?.success) throw new Error(json?.error || 'Failed to save decision')

      navigate('/admin/assessments')
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message
      setError(msg || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, id])

  if (!isAdmin) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Assessment Review</h1>
        <p className="text-gray-600">You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6 pb-28">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Assessment Review</h1>
          <div className="text-sm text-gray-600">
            <Link to="/admin/assessments" className="text-blue-600 hover:underline">
              Back to history
            </Link>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error ? <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-red-700">{error}</div> : null}

      {loading ? (
        <div className="text-gray-600">Loading…</div>
      ) : !row ? (
        <div className="text-gray-600">No assessment loaded.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-medium">AI Analysis</h2>
              <span className="text-xs text-gray-600">Status: {row.status}</span>
            </div>

            <div className="text-sm text-gray-700 mb-3">
              <div>Commit: {row.commit_hash || '-'}</div>
              <div>Final grade (server): {typeof row.final_grade === 'number' ? row.final_grade.toFixed(2) : '-'}</div>
            </div>

            <div className="mb-3">
              <div className="text-sm font-medium text-gray-800 mb-1">Summary</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{parsed?.overall_summary || '—'}</div>
            </div>

            <div className="mb-3">
              <div className="text-sm font-medium text-gray-800 mb-1">Scores</div>
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto">
                {JSON.stringify(parsed?.scores || null, null, 2)}
              </pre>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-800 mb-1">Findings</div>
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto">
                {JSON.stringify(parsed?.findings || null, null, 2)}
              </pre>
            </div>
          </div>

          <div className="border border-gray-200 rounded p-4">
            <h2 className="text-lg font-medium mb-2">Trace Log</h2>
            <div className="text-sm text-gray-700 mb-2">Exact prompt captured for this run:</div>
            <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto whitespace-pre-wrap">
              {promptText || '—'}
            </pre>
          </div>
        </div>
      )}

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-800 mb-1">Reviewer notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full border border-gray-300 rounded p-2 text-sm"
          placeholder="Add notes for audit trail…"
        />
      </div>

      <div className="fixed left-0 right-0 bottom-0 border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-end gap-2">
          <button
            onClick={() => submit('rejected')}
            disabled={saving || !row || row.status !== 'pending_review'}
            className="px-4 py-2 rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={() => submit('confirmed')}
            disabled={saving || !row || row.status !== 'pending_review'}
            className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
