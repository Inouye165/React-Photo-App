import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
  const { user } = useAuth()
  const isAdmin = useMemo(() => user?.app_metadata?.role === 'admin', [user])

  const [rows, setRows] = useState<AssessmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!isAdmin) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  if (!isAdmin) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Admin Assessments</h1>
        <p className="text-gray-600">You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Admin Assessments</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            onClick={triggerNewAssessment}
            disabled={triggering}
            className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {triggering ? 'Triggering…' : 'Trigger New Assessment'}
          </button>
        </div>
      </div>

      {error ? <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-red-700">{error}</div> : null}

      <div className="overflow-x-auto border border-gray-200 rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-3 font-medium text-gray-700">Created</th>
              <th className="p-3 font-medium text-gray-700">Status</th>
              <th className="p-3 font-medium text-gray-700">Commit</th>
              <th className="p-3 font-medium text-gray-700">Final Grade</th>
              <th className="p-3 font-medium text-gray-700">Reviewer</th>
              <th className="p-3 font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3 text-gray-600" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-3 text-gray-600" colSpan={6}>
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
                  <td className="p-3 text-gray-700">{r.commit_hash || '-'}</td>
                  <td className="p-3 text-gray-700">{typeof r.final_grade === 'number' ? r.final_grade.toFixed(2) : '-'}</td>
                  <td className="p-3 text-gray-700">{r.reviewer_id || '-'}</td>
                  <td className="p-3">
                    <Link
                      className="text-blue-600 hover:underline"
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

      <div className="mt-4 text-sm text-gray-600">
        Showing latest 50 assessments.
      </div>
    </div>
  )
}
