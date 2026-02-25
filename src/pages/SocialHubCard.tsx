import React, { useMemo, useState } from 'react'

type SocialTab = 'messages' | 'requests'

type SocialMessage = {
  id: string
  sender: string
  snippet: string
  time: string
}

type GameRequest = {
  id: string
  username: string
  timeControl: string
  time: string
}

const messageItems: SocialMessage[] = [
  { id: 'msg-1', sender: 'Nina', snippet: 'Loved your Sicilian prep. Rematch tonight?', time: '2m' },
  { id: 'msg-2', sender: 'Coach Liu', snippet: 'Review move 34 in Byrne vs Fischer before class.', time: '15m' },
  { id: 'msg-3', sender: 'Max', snippet: 'That rook lift was clean. Want a blitz set?', time: '1h' },
]

const requestItems: GameRequest[] = [
  { id: 'req-1', username: 'rookstorm91', timeControl: '10+0 Rapid', time: 'Just now' },
  { id: 'req-2', username: 'endgamequeen', timeControl: '5+3 Blitz', time: '7m ago' },
  { id: 'req-3', username: 'fianchettofan', timeControl: '15+10 Classical', time: '18m ago' },
]

export default function SocialHubCard(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<SocialTab>('messages')

  const counts = useMemo(() => ({
    messages: messageItems.length,
    requests: requestItems.length,
  }), [])

  return (
    <section className="flex min-h-0 flex-col rounded-2xl bg-chess-surface p-4 shadow-chess-card ring-1 ring-white/10" aria-labelledby="social-hub-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="social-hub-heading" className="font-display text-xl text-chess-text">Social Hub</h2>
      </div>

      <div className="inline-flex rounded-xl bg-chess-surfaceSoft p-1 ring-1 ring-white/10" role="tablist" aria-label="Social hub tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'messages'}
          aria-controls="social-messages-panel"
          id="social-messages-tab"
          onClick={() => setActiveTab('messages')}
          className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg ${
            activeTab === 'messages' ? 'bg-chess-accent text-black' : 'text-chess-text hover:bg-white/10'
          }`}
        >
          New Messages
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${activeTab === 'messages' ? 'bg-black/15 text-black' : 'bg-chess-accent/25 text-chess-accentSoft'}`}>
            {counts.messages}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'requests'}
          aria-controls="social-requests-panel"
          id="social-requests-tab"
          onClick={() => setActiveTab('requests')}
          className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg ${
            activeTab === 'requests' ? 'bg-chess-accent text-black' : 'text-chess-text hover:bg-white/10'
          }`}
        >
          Game Requests
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${activeTab === 'requests' ? 'bg-black/15 text-black' : 'bg-chess-accent/25 text-chess-accentSoft'}`}>
            {counts.requests}
          </span>
        </button>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {activeTab === 'messages' ? (
          <ul id="social-messages-panel" role="tabpanel" aria-labelledby="social-messages-tab" className="space-y-2">
            {messageItems.map((message) => (
              <li key={message.id} className="rounded-xl bg-chess-surfaceSoft p-3 ring-1 ring-white/10">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-chess-text">{message.sender}</p>
                  <span className="text-xs font-medium text-chess-muted">{message.time}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-chess-text/90">{message.snippet}</p>
              </li>
            ))}
          </ul>
        ) : (
          <ul id="social-requests-panel" role="tabpanel" aria-labelledby="social-requests-tab" className="space-y-2">
            {requestItems.map((request) => (
              <li key={request.id} className="rounded-xl bg-chess-surfaceSoft p-3 ring-1 ring-white/10">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-chess-text">{request.username}</p>
                    <p className="text-xs font-semibold text-chess-accentSoft">{request.timeControl}</p>
                  </div>
                  <span className="text-xs font-medium text-chess-muted">{request.time}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Accept game request from ${request.username}`}
                    className="inline-flex min-h-10 items-center justify-center rounded-lg bg-chess-accent px-3 py-2 text-xs font-semibold text-black transition hover:bg-chess-accentSoft active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    aria-label={`Decline game request from ${request.username}`}
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-chess-text transition hover:bg-white/10 active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}