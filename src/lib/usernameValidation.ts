export const USERNAME_MIN_LEN = 3
export const USERNAME_MAX_LEN = 30
export const USERNAME_REGEX = /^[A-Za-z0-9_]+$/

export function getUsernameValidationError(username: string): string {
  const normalized = username.trim()
  if (!normalized) return 'Username is required'
  if (normalized.length < USERNAME_MIN_LEN) return `Username must be at least ${USERNAME_MIN_LEN} characters`
  if (normalized.length > USERNAME_MAX_LEN) return `Username must be at most ${USERNAME_MAX_LEN} characters`
  if (!USERNAME_REGEX.test(normalized)) return 'Use only letters, numbers, and underscores'
  return ''
}
