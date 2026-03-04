import React, { useState } from 'react'
import { API_BASE_URL } from '../api/httpClient'

type AvatarProps = {
  src?: string | null
  username?: string | null
  size?: number
  className?: string
  loading?: 'lazy' | 'eager'
}

export default function Avatar({ src, username, size = 28, className = '', loading = 'eager' }: AvatarProps): React.JSX.Element {
  const [errored, setErrored] = useState(false)
  const initials = username ? String(username).charAt(0).toUpperCase() : ''

  if (!src || errored) {
    return (
      <div
        className={`rounded-full flex items-center justify-center text-sm font-semibold bg-slate-200 text-slate-700 border ${className}`}
        style={{ width: size, height: size }}
        title={username ?? undefined}
      >
        {initials || 'U'}
      </div>
    )
  }

  let finalSrc = src
  try {
    const looksAbsolute = /^https?:\/\//i.test(src) || src.startsWith('//')
    if (!looksAbsolute && src.startsWith('/')) {
      finalSrc = `${API_BASE_URL.replace(/\/$/, '')}${src}`
    } else if (!looksAbsolute && !src.startsWith('/')) {
      finalSrc = `${API_BASE_URL.replace(/\/$/, '')}/${src.replace(/^\//, '')}`
    }
  } catch {
    // fallback to original src
    finalSrc = src
  }

  return (
    <img
      src={finalSrc}
      alt={username ?? 'Member'}
      loading={loading}
      onError={() => setErrored(true)}
      style={{ width: size, height: size }}
      className={`rounded-full border object-cover ${className}`}
      title={username ?? undefined}
    />
  )
}
