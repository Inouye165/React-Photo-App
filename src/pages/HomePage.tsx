import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPhotoStatus, getPhotos } from '../api'
import type { Photo } from '../types/photo'
import {
  PREMIUM_FOCUS_RING,
  PREMIUM_PAGE_CONTAINER,
  PREMIUM_PAGE_SHELL,
  PREMIUM_SURFACE,
  PREMIUM_SURFACE_PADDED,
} from '../styles/ui'

type HomeLoadState = {
  loading: boolean
  totalPhotos: number
  recentPhotos: Photo[]
}

type GameCatalogItem = {
  id: string
  label: string
  description: string
  available: boolean
}

const GAME_CATALOG: GameCatalogItem[] = [
  {
    id: 'chess',
    label: 'Chess',
    description: 'Live matches, invites, and tutor/story modes.',
    available: true,
  },
  {
    id: 'checkers',
    label: 'Checkers',
    description: 'Planned next game mode.',
    available: false,
  },
  {
    id: 'wordplay',
    label: 'Wordplay',
    description: 'Planned social word game.',
    available: false,
  },
]

function toRecentTimestamp(photo: Photo): number {
  const raw = photo.updated_at || photo.created_at || photo.taken_at || photo.metadata?.DateTimeOriginal || photo.metadata?.CreateDate
  if (!raw) return 0
  const normalized = String(raw).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
  const time = Date.parse(normalized)
  return Number.isFinite(time) ? time : 0
}

function toDisplayName(photo: Photo): string {
  return photo.caption || photo.filename || `Photo #${photo.id}`
}

function toDisplayDate(photo: Photo): string {
  const raw = photo.created_at || photo.updated_at || photo.taken_at || photo.metadata?.DateTimeOriginal || photo.metadata?.CreateDate
  if (!raw) return 'Unknown date'

  const normalized = String(raw).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return 'Unknown date'
  return parsed.toLocaleDateString()
}

export default function HomePage(): React.JSX.Element {
  const navigate = useNavigate()
  const [state, setState] = useState<HomeLoadState>({
    loading: true,
    totalPhotos: 0,
    recentPhotos: [],
  })

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      try {
        const [statusResult, photosResult] = await Promise.all([
          getPhotoStatus(),
          getPhotos('photos', { limit: 12 }),
        ])

        if (cancelled) return

        const recent = Array.isArray(photosResult?.photos)
          ? [...photosResult.photos].sort((a, b) => toRecentTimestamp(b) - toRecentTimestamp(a)).slice(0, 6)
          : []

        setState({
          loading: false,
          totalPhotos: Math.max(0, Number(statusResult?.total || 0)),
          recentPhotos: recent,
        })
      } catch {
        if (cancelled) return
        setState({
          loading: false,
          totalPhotos: 0,
          recentPhotos: [],
        })
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [])

  const hasAnyPhotos = state.totalPhotos > 0 || state.recentPhotos.length > 0
  const recentForList = useMemo(() => state.recentPhotos.slice(0, 3), [state.recentPhotos])
  const recentForGrid = useMemo(() => state.recentPhotos.slice(0, 6), [state.recentPhotos])

  return (
    <main className={PREMIUM_PAGE_SHELL}>
      <div className={PREMIUM_PAGE_CONTAINER}>
        <div className="flex flex-col gap-5 sm:gap-6">
          <section className={PREMIUM_SURFACE_PADDED} aria-labelledby="home-hero-title">
            <h1 id="home-hero-title" className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Home</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-200 sm:text-base">
              Messaging and games front and center, with photos available whenever you need them.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/chat')}
                className={`inline-flex min-h-11 items-center rounded-md border border-indigo-300/60 bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-50 transition hover:bg-indigo-500/30 ${PREMIUM_FOCUS_RING}`}
              >
                Open Messages
              </button>
              <button
                type="button"
                onClick={() => navigate('/games')}
                className={`inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 ${PREMIUM_FOCUS_RING}`}
              >
                Open Games
              </button>
              <button
                type="button"
                onClick={() => navigate('/gallery')}
                className={`inline-flex min-h-11 items-center rounded-md border border-slate-600 bg-slate-900/40 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800/80 ${PREMIUM_FOCUS_RING}`}
              >
                Open Photos
              </button>
            </div>
          </section>

          <section className={`${PREMIUM_SURFACE} p-5`} aria-labelledby="home-quick-start">
            <h2 id="home-quick-start" className="text-xl font-semibold text-white">Quick start</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-600 bg-slate-900/60 p-4 lg:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Start here</p>
                <h3 className="mt-1 text-lg font-semibold text-white">Jump into collaboration and play</h3>
                <p className="mt-1 text-sm text-slate-300">Open your chat rooms, then launch games from the shared games hub.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/chat')}
                    className={`inline-flex min-h-11 items-center rounded-md border border-indigo-300/60 bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-50 transition hover:bg-indigo-500/30 ${PREMIUM_FOCUS_RING}`}
                  >
                    Open Messages
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/games')}
                    className={`inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 ${PREMIUM_FOCUS_RING}`}
                  >
                    Open Games
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-600 bg-slate-900/60 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-200">Recent</h3>
                {state.loading ? (
                  <p className="mt-3 text-sm text-slate-300">Loading recent activity…</p>
                ) : recentForList.length > 0 ? (
                  <ul className="mt-3 space-y-2" aria-label="Recent photos">
                    {recentForList.map((photo) => (
                      <li key={String(photo.id)}>
                        <button
                          type="button"
                          onClick={() => navigate(`/photos/${photo.id}`)}
                          className={`w-full rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-left transition hover:border-indigo-300/70 ${PREMIUM_FOCUS_RING}`}
                          aria-label={`Open recent photo ${toDisplayName(photo)}`}
                        >
                          <p className="text-sm font-medium text-slate-100">{toDisplayName(photo)}</p>
                          <p className="mt-0.5 text-xs text-slate-300">{toDisplayDate(photo)}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                    <p className="text-sm text-slate-200">No recent activity yet</p>
                    <button
                      type="button"
                      onClick={() => navigate('/gallery')}
                      className={`mt-2 inline-flex min-h-10 items-center rounded-md border border-indigo-300/60 bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-50 transition hover:bg-indigo-500/30 ${PREMIUM_FOCUS_RING}`}
                    >
                      Go to Photos
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="home-spotlight" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className={`${PREMIUM_SURFACE_PADDED}`}>
              <h2 id="home-spotlight" className="text-lg font-semibold text-white">Photos</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-300">
                <li>Search and filter quickly</li>
                <li>Organize with clean layouts</li>
                <li>Keep personal content private</li>
              </ul>
              <button
                type="button"
                onClick={() => navigate('/gallery')}
                className={`mt-4 inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 ${PREMIUM_FOCUS_RING}`}
              >
                Open Photos
              </button>
            </div>

            <div className={`${PREMIUM_SURFACE_PADDED}`}>
              <h2 className="text-lg font-semibold text-white">Messages</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-300">
                <li>Chat in dedicated rooms</li>
                <li>Share context while reviewing photos</li>
                <li>Stay synced with unread indicators</li>
              </ul>
              <button
                type="button"
                onClick={() => navigate('/chat')}
                className={`mt-4 inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 ${PREMIUM_FOCUS_RING}`}
              >
                Open Messages
              </button>
            </div>

            <div className={`${PREMIUM_SURFACE_PADDED}`}>
              <h2 className="text-lg font-semibold text-white">Games</h2>
              <ul className="mt-2 space-y-2 text-sm text-slate-200" aria-label="Games catalog">
                {GAME_CATALOG.map((game) => (
                  <li key={game.id} className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-100">{game.label}</span>
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${game.available ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>
                        {game.available ? 'Available' : 'Coming soon'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-300">{game.description}</p>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => navigate('/games')}
                className={`mt-4 inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 ${PREMIUM_FOCUS_RING}`}
              >
                Open Games
              </button>
            </div>
          </section>

          {!hasAnyPhotos ? (
            <section className="rounded-2xl border border-indigo-400/40 bg-indigo-500/10 p-5" aria-label="Empty photos state">
              <h2 className="text-xl font-semibold text-white">Upload your first photo</h2>
              <p className="mt-1 text-sm text-indigo-100">Start your library with one upload, then organize and search everything from Photos.</p>
              <button
                type="button"
                onClick={() => navigate('/upload')}
                className={`mt-3 inline-flex min-h-11 items-center rounded-md border border-indigo-300/70 bg-indigo-500/25 px-3 py-2 text-sm font-semibold text-indigo-50 transition hover:bg-indigo-500/35 ${PREMIUM_FOCUS_RING}`}
              >
                Upload now
              </button>
            </section>
          ) : (
            <section className={`${PREMIUM_SURFACE_PADDED}`} aria-label="Recent photos preview">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Recent photos</h2>
                <button
                  type="button"
                  onClick={() => navigate('/gallery')}
                  className={`rounded-md border border-slate-600 bg-slate-900/50 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 ${PREMIUM_FOCUS_RING}`}
                >
                  View all
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {recentForGrid.map((photo) => (
                  <button
                    key={String(photo.id)}
                    type="button"
                    onClick={() => navigate(`/photos/${photo.id}`)}
                    className={`rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-3 text-left transition hover:border-indigo-300/60 ${PREMIUM_FOCUS_RING}`}
                    aria-label={`Open photo ${toDisplayName(photo)}`}
                  >
                    <p className="text-sm font-medium text-slate-100">{toDisplayName(photo)}</p>
                    <p className="mt-1 text-xs text-slate-400">{toDisplayDate(photo)}</p>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
