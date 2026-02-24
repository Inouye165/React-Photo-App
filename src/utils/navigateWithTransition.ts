import type { NavigateFunction, NavigateOptions, To } from 'react-router-dom'

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => unknown
}

export function navigateWithTransition(
  navigate: NavigateFunction,
  to: To,
  options?: NavigateOptions,
): void {
  const doc = document as DocumentWithViewTransition

  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(() => {
      navigate(to, options)
    })
    return
  }

  navigate(to, options)
}
