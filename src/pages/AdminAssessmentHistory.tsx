import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function extractProviderModel(row: AssessmentRow): { provider: string; model: string } {
  const raw = asObject(row.raw_ai_response)
  const provider = raw && typeof raw.provider === 'string' ? raw.provider : ''
  const model = raw && typeof raw.model === 'string' ? raw.model : ''
  return { provider, model }
}

function extractSuggestedGrade(row: AssessmentRow): number | null {
  const raw = asObject(row.raw_ai_response)
  const direct = raw?.final_grade
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct
  const parsed = asObject(raw?.parsed)
  const parsedGrade = parsed?.final_grade
  return typeof parsedGrade === 'number' && Number.isFinite(parsedGrade) ? parsedGrade : null
}

function statusBadgeClass(status: AssessmentStatus): string {
  switch (status) {
    case 'confirmed':
      return 'bg-green-100 text-green-800'
    case 'rejected':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-yellow-100 text-yellow-800'
  }
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

export default function AdminAssessmentHistory() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = useMemo(() => user?.app_metadata?.role === 'admin', [user])

  const [rows, setRows] = useState<AssessmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [externalProvider, setExternalProvider] = useState('')
  const [externalModel, setExternalModel] = useState('')
  const [externalPrompt, setExternalPrompt] = useState('')
  const [externalResponse, setExternalResponse] = useState('')
  const [externalGrade, setExternalGrade] = useState('')
  const [savingExternal, setSavingExternal] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeadersAsync(false)
      const json = await request<{ success?: boolean; data?: AssessmentRow[]; error?: string }>({
        path: '/api/admin/assessments?limit=50&offset=0',
        method: 'GET',
        headers,
      })

      if (!json?.success) throw new Error(json?.error || 'Failed to load assessments')
      setRows(Array.isArray(json.data) ? json.data : [])
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message
      setError(msg || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function triggerNewAssessment() {
    setTriggering(true)
    setError(null)
    try {
      const headers = await getAuthHeadersAsync(true)
      const json = await request<{ success?: boolean; data?: { id?: string }; error?: string }>({
        path: '/api/admin/assessments/trigger',
        method: 'POST',
        headers,
        body: { commit_hash: null },
      })
      if (!json?.success) throw new Error(json?.error || 'Failed to trigger assessment')

      // Refresh list after trigger
      await load()

      // If server returns new id, scroll to top.
      if (json?.data?.id) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message
      setError(msg || 'Failed to trigger')
    } finally {
      setTriggering(false)
    }
  }

  async function submitExternalAssessment() {
    setSavingExternal(true)
    setError(null)
    try {
      const provider = externalProvider.trim()
      const model = externalModel.trim()
      const responseText = externalResponse.trim()
      const prompt = externalPrompt

      if (!provider) throw new Error('LLM provider is required')
      if (!model) throw new Error('Model is required')
      if (!responseText) throw new Error('Response text is required')

      const maybeGrade = externalGrade.trim()
      const gradeNum = maybeGrade ? Number(maybeGrade) : null
      const final_grade = gradeNum != null && Number.isFinite(gradeNum) ? gradeNum : undefined

      const headers = await getAuthHeadersAsync(true)
      const json = await request<{ success?: boolean; data?: { id?: string }; error?: string }>(
        {
          path: '/api/admin/assessments/external',
          method: 'POST',
          headers,
          body: {
            commit_hash: null,
            llm_provider: provider,
            llm_model: model,
            prompt,
            responseText,
            final_grade,
          },
        },
      )

      if (!json?.success) throw new Error(json?.error || 'Failed to create external assessment')

      setExternalProvider('')
      setExternalModel('')
      setExternalPrompt('')
      setExternalResponse('')
      setExternalGrade('')

      await load()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message
      setError(msg || 'Failed to save external assessment')
    } finally {
      setSavingExternal(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  if (!isAdmin) {
    return (
      <div className={PREMIUM_PAGE_SHELL}>
        <div className={`${PREMIUM_PAGE_CONTAINER} page-enter-fade`}>
          <div className="mx-auto max-w-5xl rounded-2xl border border-slate-700 bg-slate-800/70 p-6">
            <h1 className="mb-2 text-2xl font-semibold text-white">Admin Assessments</h1>
            <p className="text-slate-300">You do not have permission to view this page.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={PREMIUM_PAGE_SHELL}>
      <div className={`${PREMIUM_PAGE_CONTAINER} page-enter-fade`}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-white">Admin Assessments</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-slate-100 hover:border-slate-400 disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            onClick={triggerNewAssessment}
            disabled={triggering}
            className="rounded-md border border-indigo-300/60 bg-indigo-500/20 px-3 py-2 font-semibold text-indigo-50 hover:bg-indigo-500/30 disabled:opacity-50"
          >
            {triggering ? 'Triggering…' : 'Trigger New Assessment'}
          </button>
        </div>
      </div>

      <div className={`${PREMIUM_SURFACE} mb-6 p-4`}>
        <h2 className="mb-2 text-lg font-medium text-white">Add External Assessment</h2>
        <p className="mb-3 text-sm text-slate-300">
          Paste a review result from ChatGPT/Gemini (or other LLM). Optionally include the numeric grade.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">LLM provider</label>
            <input
              value={externalProvider}
              onChange={(e) => setExternalProvider(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 text-sm"
              placeholder="e.g., openai, google, anthropic"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Model</label>
            <input
              value={externalModel}
              onChange={(e) => setExternalModel(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 text-sm"
              placeholder="e.g., gpt-4.1, gemini-2.0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Suggested grade (optional)</label>
            <input
              value={externalGrade}
              onChange={(e) => setExternalGrade(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 text-sm"
              placeholder="e.g., 82.5"
              inputMode="decimal"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-800 mb-1">Prompt (optional)</label>
            <textarea
              value={externalPrompt}
              onChange={(e) => setExternalPrompt(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded p-2 text-sm"
              placeholder="Paste the prompt you used (if you have it)…"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-800 mb-1">Response text</label>
            <textarea
              value={externalResponse}
              onChange={(e) => setExternalResponse(e.target.value)}
              rows={6}
              className="w-full border border-gray-300 rounded p-2 text-sm"
              placeholder="Paste the model's response…"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end">
          <button
            onClick={submitExternalAssessment}
            disabled={savingExternal}
            className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {savingExternal ? 'Saving…' : 'Save External Assessment'}
          </button>
        </div>
      </div>

      {error ? <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-red-700">{error}</div> : null}

      <div className={`${PREMIUM_SURFACE} overflow-x-auto`}>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-3 font-medium text-gray-700">Created</th>
              <th className="p-3 font-medium text-gray-700">Status</th>
              <th className="p-3 font-medium text-gray-700">LLM</th>
              <th className="p-3 font-medium text-gray-700">AI Grade</th>
              <th className="p-3 font-medium text-gray-700">Commit</th>
              <th className="p-3 font-medium text-gray-700">Final Grade</th>
              <th className="p-3 font-medium text-gray-700">Reviewer</th>
              <th className="p-3 font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3 text-gray-600" colSpan={8}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-3 text-gray-600" colSpan={8}>
                  No assessments yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="p-3 text-gray-700">{formatDate(r.created_at)}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${statusBadgeClass(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3 text-gray-700">
                    {(() => {
                      const { provider, model } = extractProviderModel(r)
                      const label = [provider, model].filter(Boolean).join(' / ')
                      return label || '-'
                    })()}
                  </td>
                  <td className="p-3 text-gray-700">
                    {(() => {
                      const g = extractSuggestedGrade(r)
                      return typeof g === 'number' ? g.toFixed(2) : '-'
                    })()}
                  </td>
                  <td className="p-3 text-gray-700">{r.commit_hash || '-'}</td>
                  <td className="p-3 text-gray-700">{typeof r.final_grade === 'number' ? r.final_grade.toFixed(2) : '-'}</td>
                  <td className="p-3 text-gray-700">{r.reviewer_id || '-'}</td>
                  <td className="p-3">
                    <Link
                      className="text-indigo-200 hover:text-indigo-100 hover:underline"
                      onClick={(e) => {
                        e.preventDefault()
                        navigateWithTransition(navigate, `/admin/assessments/${encodeURIComponent(r.id)}`)
                      }}
                      to={`/admin/assessments/${encodeURIComponent(r.id)}`}
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-slate-300">
        Showing latest 50 assessments.
      </div>
      </div>
    </div>
  )
}
