export type AuthHeaderProvider =
  | (() => Promise<Record<string, string> | undefined> | Record<string, string> | undefined)
  | null

let provider: AuthHeaderProvider = null

export function setAuthHeaderProvider(next: AuthHeaderProvider): void {
  provider = next
}

export async function getAuthHeadersFromProvider(): Promise<Record<string, string> | undefined> {
  if (!provider) return undefined
  try {
    const headers = await provider()
    return headers ?? undefined
  } catch {
    return undefined
  }
}
