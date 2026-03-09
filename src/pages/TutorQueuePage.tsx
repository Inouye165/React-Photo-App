import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Clock3, RefreshCcw } from 'lucide-react'
import { claimWhiteboardHelpRequest, listTutorQueueRequests } from '../api/whiteboards'
import { useAuth } from '../contexts/AuthContext'
import type { WhiteboardHelpRequest } from '../types/whiteboard'

function formatRelative(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'Unknown time'
  const deltaMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
  if (deltaMinutes < 1) return 'Just now'
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`
  const deltaHours = Math.round(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`
  return `${Math.round(deltaHours / 24)}d ago`
}

export default function TutorQueuePage(): React.JSX.Element {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const canUseTutorQueue = user?.app_metadata?.role === 'admin' || user?.app_metadata?.is_tutor === true || profile?.is_tutor === true
  const [pendingRequests, setPendingRequests] = useState<WhiteboardHelpRequest[]>([])
  const [claimedRequests, setClaimedRequests] = useState<WhiteboardHelpRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  const heading = useMemo(() => (canUseTutorQueue ? 'Tutor queue' : 'Tutor access required'), [canUseTutorQueue])

  const loadQueue = async () => {
    if (!canUseTutorQueue) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [pending, claimed] = await Promise.all([
        listTutorQueueRequests({ status: 'pending' }),
        listTutorQueueRequests({ status: 'claimed', mine: true }),
      ])
      setPendingRequests(pending)
      setClaimedRequests(claimed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the tutor queue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadQueue()
  }, [canUseTutorQueue])

  const handleClaim = async (requestId: string) => {
    setClaimingId(requestId)
    setError(null)
    try {
      const claimed = await claimWhiteboardHelpRequest(requestId)
      navigate(`/whiteboards/${claimed.boardId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to claim help request')
    } finally {
      setClaimingId(null)
    }
  }

  return (
    <main className="min-h-full overflow-y-auto rounded-[28px] bg-[#0D0D0D] px-4 py-4 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/whiteboards')}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1A1A1A] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#2A2A2A]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div>
              <h1 className="text-2xl font-semibold">{heading}</h1>
              <p className="mt-1 text-sm text-white/60">Claim waiting students, then jump straight into their whiteboard.</p>
            </div>
          </div>
          {canUseTutorQueue ? (
            <button
              type="button"
              onClick={() => void loadQueue()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-medium text-white transition hover:bg-white/[0.06]"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
          ) : null}
        </div>

        {!canUseTutorQueue ? (
          <div className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
            Only tutors and admins can open the tutor queue.
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-[#151515] p-5 shadow-[0_20px_40px_rgba(0,0,0,0.24)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#F0EDE8]">
              <Clock3 className="h-4 w-4 text-amber-300" />
              Waiting now
            </div>

            <div className="mt-4 space-y-3">
              {loading ? <p className="text-sm text-white/60">Loading requests…</p> : null}
              {!loading && pendingRequests.length === 0 ? <p className="text-sm text-white/60">No students are waiting right now.</p> : null}
              {pendingRequests.map((item) => (
                <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[#F0EDE8]">{item.boardName || 'Untitled whiteboard'}</div>
                      <div className="mt-1 text-xs text-white/50">
                        {item.studentUsername || 'Student'} · {formatRelative(item.createdAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleClaim(item.id)}
                      disabled={claimingId === item.id}
                      className="inline-flex shrink-0 items-center justify-center rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                    >
                      {claimingId === item.id ? 'Claiming…' : 'Claim'}
                    </button>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-[1.6] text-[#d8cfc4]">{item.requestText || 'Help requested on this whiteboard.'}</p>
                  {item.problemDraft ? (
                    <p className="mt-3 line-clamp-3 text-xs leading-[1.6] text-white/55">{item.problemDraft}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#151515] p-5 shadow-[0_20px_40px_rgba(0,0,0,0.24)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#F0EDE8]">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              Claimed by you
            </div>

            <div className="mt-4 space-y-3">
              {loading ? <p className="text-sm text-white/60">Loading claimed requests…</p> : null}
              {!loading && claimedRequests.length === 0 ? <p className="text-sm text-white/60">You have no claimed whiteboards right now.</p> : null}
              {claimedRequests.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(`/whiteboards/${item.boardId}`)}
                  className="block w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:bg-white/[0.06]"
                >
                  <div className="text-sm font-semibold text-[#F0EDE8]">{item.boardName || 'Untitled whiteboard'}</div>
                  <div className="mt-1 text-xs text-white/50">{item.studentUsername || 'Student'} · claimed {formatRelative(item.claimedAt || item.updatedAt)}</div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-[1.6] text-[#d8cfc4]">{item.requestText || 'Help requested on this whiteboard.'}</p>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
