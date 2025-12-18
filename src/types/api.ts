export type PhotoState = 'working' | 'inprogress' | 'finished' | 'error'

export type ApiResponse<T> =
  | ({ success: true } & T)
  | { success: false; error: string }

// Intentionally minimal: avoid encouraging logging raw Error/request metadata.
export interface ApiErrorInfo {
  message: string
  status?: number
  isNetworkError?: boolean
}

export interface PhotoStatusResponse {
  success: boolean
  working: number
  inprogress: number
  finished: number
  total: number
  error?: string
}

export interface ModelAllowlistResponse {
  models: string[]
  source: string
  updatedAt: string | null
}
