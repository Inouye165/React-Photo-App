export function openSingletonWindow(url: string, name: string): Window | null {
  if (typeof window === 'undefined') return null
  const next = window.open(url, name)
  if (next) {
    try {
      next.focus()
    } catch {
      // ignore focus errors
    }
  }
  return next
}
