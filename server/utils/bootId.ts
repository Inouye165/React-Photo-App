import { randomUUID } from 'crypto'

const BOOT_ID: string = (() => {
  try {
    return randomUUID()
  } catch {
    // Extremely defensive fallback (older runtimes): stable-per-process, not per-request.
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
})()

export function getBootId(): string {
  return BOOT_ID
}
