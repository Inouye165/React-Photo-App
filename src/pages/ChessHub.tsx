import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, BookOpen, Users } from 'lucide-react'
import { createGameAndOpenTutorTab } from '../features/chess/navigation'

export default function ChessHub(): React.JSX.Element {
  const navigate = useNavigate()
  const [loadingTutorials, setLoadingTutorials] = useState(false)
  const [tutorialError, setTutorialError] = useState<string | null>(null)

  const handleTutorials = async (): Promise<void> => {
    setLoadingTutorials(true)
    setTutorialError(null)
    try {
      await createGameAndOpenTutorTab(navigate, 'lesson')
    } catch {
      setTutorialError('Unable to start tutorials right now. Please try again.')
    } finally {
      setLoadingTutorials(false)
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Chess</h1>
        <p className="mt-2 text-sm text-slate-600">Choose how you want to jump into chess. Each option opens the current in-app chess experience.</p>
      </header>

      {tutorialError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status" aria-live="polite">
          {tutorialError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <button
          type="button"
          onClick={() => navigate('/games/local?tab=analyze')}
          className="flex min-h-[160px] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-indigo-300"
        >
          <Bot size={22} className="text-indigo-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Play vs Computer</h2>
            <p className="mt-1 text-sm text-slate-600">Start a local match with engine support and analysis tools.</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/games')}
          className="flex min-h-[160px] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-indigo-300"
        >
          <Users size={22} className="text-indigo-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Play vs Opponent (Invite)</h2>
            <p className="mt-1 text-sm text-slate-600">Open your games dashboard to invite another player.</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => { void handleTutorials() }}
          disabled={loadingTutorials}
          className="flex min-h-[160px] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <BookOpen size={22} className="text-indigo-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Tutorials</h2>
            <p className="mt-1 text-sm text-slate-600">Create a chess session and open directly in tutorial mode.</p>
            {loadingTutorials ? <p className="mt-2 text-xs text-slate-500">Starting tutorial…</p> : null}
          </div>
        </button>
      </div>
    </section>
  )
}