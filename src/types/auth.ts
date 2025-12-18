export interface AuthUser {
  id: string
  email?: string | null
  username?: string | null
  // Keep extensible without implying any specific sensitive fields.
  user_metadata?: Record<string, unknown>
}
