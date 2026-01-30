type BuildPadUrlOptions = {
  boardId: string
  origin?: string
}

export function buildPadUrl({ boardId, origin }: BuildPadUrlOptions): string {
  const safeBoardId = encodeURIComponent(boardId)
  const path = `/chat/${safeBoardId}/pad`

  if (origin && origin.trim()) {
    return new URL(path, origin).toString()
  }

  if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    return new URL(path, window.location.origin).toString()
  }

  return path
}
