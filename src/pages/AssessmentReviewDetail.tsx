import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { request, ApiError } from '../api/httpClient'
import { getAuthHeadersAsync } from '../api/auth'
import { useAuth } from '../contexts/AuthContext'
import { PREMIUM_PAGE_CONTAINER, PREMIUM_PAGE_SHELL, PREMIUM_SURFACE } from '../styles/ui'
import { navigateWithTransition } from '../utils/navigateWithTransition'

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

  const providerModel = useMemo(() => {
    const raw = asObject(row?.raw_ai_response)
    const provider = raw && typeof raw.provider === 'string' ? raw.provider : ''
    const model = raw && typeof raw.model === 'string' ? raw.model : ''
    return { provider, model }
  }, [row])

  const responseText: string = useMemo(() => {
    const raw = asObject(row?.raw_ai_response)
    const text = raw?.responseText
    return typeof text === 'string' ? text : ''
  }, [row])

  const suggestedGrade: number | null = useMemo(() => {
    const raw = asObject(row?.raw_ai_response)
    const direct = raw?.final_grade
    if (typeof direct === 'number' && Number.isFinite(direct)) return direct
    const p = asObject(raw?.parsed)
    const pg = p?.final_grade
    return typeof pg === 'number' && Number.isFinite(pg) ? pg : null
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
      const json = await request<{ success?: boolean; data?: AssessmentRow; error?: string }>({
        path: `/api/admin/assessments/${encodeURIComponent(id)}`,
        method: 'GET',
        headers,
      })
      if (!json?.success) throw new Error(json?.error || 'Failed to load assessment')

      const found = json.data || null
      setRow(found)
      setNotes(found?.notes || '')
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

      navigateWithTransition(navigate, '/admin/assessments')
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
      <div className={PREMIUM_PAGE_SHELL}>
        <div className={`${PREMIUM_PAGE_CONTAINER} page-enter-fade`}>
          <div className="mx-auto max-w-6xl rounded-2xl border border-slate-700 bg-slate-800/70 p-6">
            <h1 className="mb-2 text-2xl font-semibold text-white">Assessment Review</h1>
            <p className="text-slate-300">You do not have permission to view this page.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={PREMIUM_PAGE_SHELL}>
      <div className={`${PREMIUM_PAGE_CONTAINER} page-enter-fade pb-28`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Assessment Review</h1>
          <div className="text-sm text-slate-300">
            <Link
              to="/admin/assessments"
              className="text-indigo-200 hover:text-indigo-100 hover:underline"
              onClick={(e) => {
                e.preventDefault()
                navigateWithTransition(navigate, '/admin/assessments')
              }}
            >
              Back to history
            </Link>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-slate-100 hover:border-slate-400 disabled:opacity-50"
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
          <div className={`${PREMIUM_SURFACE} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-medium">AI Analysis</h2>
              <span className="text-xs text-gray-600">Status: {row.status}</span>
            </div>

            <div className="text-sm text-gray-700 mb-3">
              <div>Commit: {row.commit_hash || '-'}</div>
              <div>
                LLM: {providerModel.provider || '-'} / {providerModel.model || '-'}
              </div>
              <div>
                AI suggested grade: {typeof suggestedGrade === 'number' ? suggestedGrade.toFixed(2) : '-'}
              </div>
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

            <div className="mb-3">
              <div className="text-sm font-medium text-gray-800 mb-1">Raw response</div>
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto whitespace-pre-wrap">
                {responseText || '—'}
              </pre>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-800 mb-1">Findings</div>
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto">
                {JSON.stringify(parsed?.findings || null, null, 2)}
              </pre>
            </div>
          </div>

          <div className={`${PREMIUM_SURFACE} p-4`}>
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

      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-700 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 p-4">
          <button
            onClick={() => submit('rejected')}
            disabled={saving || !row || row.status !== 'pending_review'}
            className="rounded-md border border-red-300/70 px-4 py-2 text-red-200 hover:bg-red-500/10 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={() => submit('confirmed')}
            disabled={saving || !row || row.status !== 'pending_review'}
            className="rounded-md border border-emerald-300/70 bg-emerald-500/20 px-4 py-2 font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}
