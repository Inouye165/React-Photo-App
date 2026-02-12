const GAMES_CHANGED_EVENT = 'games:changed'

export function notifyGamesChanged(): void {
  if (typeof document === 'undefined') return
  document.dispatchEvent(new Event(GAMES_CHANGED_EVENT))
}

export function onGamesChanged(cb: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  const handler = () => cb()
  document.addEventListener(GAMES_CHANGED_EVENT, handler)
  return () => {
    document.removeEventListener(GAMES_CHANGED_EVENT, handler)
  }
}
