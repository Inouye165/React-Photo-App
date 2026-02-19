import { describe, it, expect } from 'vitest'
import { validateSupabaseUrl } from './env'

describe('validateSupabaseUrl', () => {
  it('throws when production URL contains localhost', () => {
    expect(() => validateSupabaseUrl('http://localhost:54321', 'production'))
      .toThrow('Production build misconfigured')
  })

  it('throws when production URL contains 127.0.0.1', () => {
    expect(() => validateSupabaseUrl('http://127.0.0.1:54321', 'production'))
      .toThrow('Production build misconfigured')
  })

  it('throws case-insensitively for LOCALHOST', () => {
    expect(() => validateSupabaseUrl('http://LOCALHOST:54321', 'production'))
      .toThrow('Production build misconfigured')
  })

  it('does not throw for a valid hosted Supabase URL in production', () => {
    expect(() =>
      validateSupabaseUrl('https://xcidibfijzyoyliyclug.supabase.co', 'production'),
    ).not.toThrow()
  })

  it('does not throw for localhost in development mode', () => {
    expect(() =>
      validateSupabaseUrl('http://localhost:54321', 'development'),
    ).not.toThrow()
  })

  it('does not throw for localhost in test mode', () => {
    expect(() =>
      validateSupabaseUrl('http://localhost:54321', 'test'),
    ).not.toThrow()
  })

  it('does not throw when mode is empty', () => {
    expect(() =>
      validateSupabaseUrl('http://localhost:54321', ''),
    ).not.toThrow()
  })
})
