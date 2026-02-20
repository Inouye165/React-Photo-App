import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, BookOpen, Users } from 'lucide-react'

export default function ChessHub(): React.JSX.Element {
  const navigate = useNavigate()

  return (
    <section className="flex h-full min-h-[100dvh] w-full flex-col bg-slate-900 px-4 pb-6 pt-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6">
        <header className="rounded-2xl border border-slate-700 bg-slate-800/80 p-5">
          <h1 className="text-2xl font-bold">Chess</h1>
          <p className="mt-2 text-sm text-slate-300">Pick a mode and jump in. This view is optimized as an app-like fullscreen experience across phones, tablets, and desktops.</p>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
          <button
            type="button"
            onClick={() => navigate('/games/local?tab=analyze')}
            className="flex min-h-[180px] flex-col items-start justify-between rounded-2xl border border-indigo-400/50 bg-slate-800 p-5 text-left shadow-sm hover:border-indigo-300"
          >
            <Bot size={22} className="text-indigo-300" />
            <div>
              <h2 className="text-lg font-semibold">Play vs Computer</h2>
              <p className="mt-1 text-sm text-slate-300">Start a local match with engine support and analysis tools.</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/games')}
            className="flex min-h-[180px] flex-col items-start justify-between rounded-2xl border border-indigo-400/50 bg-slate-800 p-5 text-left shadow-sm hover:border-indigo-300"
          >
            <Users size={22} className="text-indigo-300" />
            <div>
              <h2 className="text-lg font-semibold">Play vs Opponent (Invite)</h2>
              <p className="mt-1 text-sm text-slate-300">Open your games dashboard to invite another player.</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/games/local?tab=lesson&tutor=1&story=1&storyId=architect-of-squares')}
            className="flex min-h-[180px] flex-col items-start justify-between rounded-2xl border border-indigo-400/50 bg-slate-800 p-5 text-left shadow-sm hover:border-indigo-300"
          >
            <BookOpen size={22} className="text-indigo-300" />
            <div>
              <h2 className="text-lg font-semibold">Tutorials</h2>
              <p className="mt-1 text-sm text-slate-300">Open the local chess tutor in fullscreen mode.</p>
            </div>
          </button>
        </div>
      </div>
    </section>
  )
}