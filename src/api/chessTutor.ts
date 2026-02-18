import { getAuthHeadersAsync } from './auth'
import { request } from './httpClient'
import { ApiError } from './httpClient'

export type ChessTutorAnalysis = {
  positionSummary: string
  hints: string[]
  focusAreas: string[]
}

export type ChessTutorResult = {
  analysis: ChessTutorAnalysis
  model: string
  apiVersion?: string
}

export type EnsureStoryAudioResult = {
  cached: boolean
  url: string
  audioBase64?: string
}

export type StoryAudioSetupStatus = {
  configured: {
    supabaseUrl: boolean
    openAiTts: boolean
  }
  bucket: {
    exists: boolean | null
    isPublic: boolean | null
    publicReadProbe: 'ok' | 'forbidden' | 'unreachable' | 'unknown'
  }
  warnings: string[]
}

type StoryAudioManifestEntry = {
  page: number
  hash: string
  objectPath?: string
  url?: string
  wordCount?: number
}

type StoryAudioManifest = {
  storySlug: string
  voice?: string
  cacheVersion: string
  bucket?: string
  totalPages: number
  generatedAt?: string
  entries: StoryAudioManifestEntry[]
}

type AnalyzeChessTutorResponse = {
  success: boolean
  analysis?: ChessTutorAnalysis
  model?: string
  apiVersion?: string
  error?: string
}

type EnsureStoryAudioResponse = {
  success: boolean
  cached?: boolean
  url?: string
  audioBase64?: string
  error?: string
}

type StoryAudioSetupStatusResponse = {
  success: boolean
  configured?: {
    supabaseUrl: boolean
    openAiTts: boolean
  }
  bucket?: {
    exists: boolean | null
    isPublic: boolean | null
    publicReadProbe: 'ok' | 'forbidden' | 'unreachable' | 'unknown'
  }
  warnings?: string[]
  error?: string
}

const STORY_AUDIO_CACHE_VERSION = 'v2'
const STORY_AUDIO_BUCKET = 'story-audio'
const STORY_AUDIO_URL_CACHE_STORAGE_KEY = 'story-audio-url-cache-v1'
const STORY_AUDIO_URL_CACHE_MAX_ENTRIES = 200

type StoryAudioClientMetrics = {
  ensureApiCalls: number
  localCacheHits: number
  precomputedHits: number
  precomputedMisses: number
  manifestLoads: number
  manifestLoadFailures: number
}

type StoryAudioUrlCacheEntry = {
  url: string
  updatedAt: number
}

const storyAudioUrlMemoryCache = new Map<string, StoryAudioUrlCacheEntry>()
const storyAudioManifestPromiseBySlug = new Map<string, Promise<StoryAudioManifest | null>>()
const storyAudioClientMetrics: StoryAudioClientMetrics = {
  ensureApiCalls: 0,
  localCacheHits: 0,
  precomputedHits: 0,
  precomputedMisses: 0,
  manifestLoads: 0,
  manifestLoadFailures: 0,
}
let forcedPrecomputedOnlyModeForTests: boolean | null = null

function isTruthyEnvValue(value: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value)
}

function isFalsyEnvValue(value: string): boolean {
  return ['0', 'false', 'no', 'off'].includes(value)
}

function isStoryAudioPrecomputedOnlyMode(): boolean {
  if (forcedPrecomputedOnlyModeForTests != null) return forcedPrecomputedOnlyModeForTests

  const configured = String(import.meta.env.VITE_STORY_AUDIO_PRECOMPUTED_ONLY || '').trim().toLowerCase()
  if (configured && isTruthyEnvValue(configured)) return true
  if (configured && isFalsyEnvValue(configured)) return false

  return Boolean(import.meta.env.PROD)
}

function logStoryAudioClient(event: string, details?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return
  console.info(`[story-audio/client] ${event}`, details || {})
}

function normalizeNarrationText(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

async function sha256Hex(value: string): Promise<string> {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(value)
  const digestBuffer = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const digestArray = Array.from(new Uint8Array(digestBuffer))
  return digestArray.map((entry) => entry.toString(16).padStart(2, '0')).join('')
}

async function buildStoryAudioContentHash(input: { text: string; totalPages: number; voice: 'shimmer' | string }): Promise<string> {
  const payload = JSON.stringify({
    version: STORY_AUDIO_CACHE_VERSION,
    text: normalizeNarrationText(input.text),
    totalPages: Number(input.totalPages || 1),
    voice: String(input.voice || 'shimmer'),
  })

  const hash = await sha256Hex(payload)
  return hash.slice(0, 16)
}

async function buildStoryAudioObjectPath(input: {
  storySlug: string
  page: number
  text: string
  totalPages: number
  voice: 'shimmer' | string
}): Promise<{ objectPath: string; hash: string }> {
  const hash = await buildStoryAudioContentHash({
    text: input.text,
    totalPages: input.totalPages,
    voice: input.voice,
  })
  return {
    hash,
    objectPath: `${input.storySlug}/${STORY_AUDIO_CACHE_VERSION}/page-${input.page}-${hash}.mp3`,
  }
}

function getSupabaseBaseUrl(): string | null {
  const viteBase = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
  if (viteBase) return viteBase.replace(/\/$/, '')
  return null
}

function buildStoryAudioPublicUrlFromObjectPath(objectPath: string): string | null {
  const supabaseBase = getSupabaseBaseUrl()
  if (!supabaseBase) return null
  return `${supabaseBase}/storage/v1/object/public/${STORY_AUDIO_BUCKET}/${objectPath}`
}

function getStoryAudioCacheNamespace(): string {
  const supabaseBase = getSupabaseBaseUrl()
  if (!supabaseBase) return 'default'
  try {
    return new URL(supabaseBase).origin.toLowerCase()
  } catch {
    return supabaseBase.toLowerCase()
  }
}

function isCompatibleStoryAudioUrl(url: string): boolean {
  const supabaseBase = getSupabaseBaseUrl()
  if (!supabaseBase) return true

  try {
    const expectedOrigin = new URL(supabaseBase).origin.toLowerCase()
    const candidate = new URL(String(url || '').trim())
    if (candidate.protocol === 'blob:') return true
    return candidate.origin.toLowerCase() === expectedOrigin
  } catch {
    return false
  }
}

function getStoryAudioUrlCacheSnapshotFromStorage(): Record<string, StoryAudioUrlCacheEntry> {
  if (typeof window === 'undefined') return {}
  try {
    const rawValue = window.localStorage.getItem(STORY_AUDIO_URL_CACHE_STORAGE_KEY)
    if (!rawValue) return {}
    const parsed = JSON.parse(rawValue) as Record<string, StoryAudioUrlCacheEntry>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveStoryAudioUrlCacheSnapshotToStorage(snapshot: Record<string, StoryAudioUrlCacheEntry>): void {
  if (typeof window === 'undefined') return
  try {
    const entries = Object.entries(snapshot)
      .sort((left, right) => (right[1]?.updatedAt || 0) - (left[1]?.updatedAt || 0))
      .slice(0, STORY_AUDIO_URL_CACHE_MAX_ENTRIES)

    const compactSnapshot: Record<string, StoryAudioUrlCacheEntry> = {}
    for (const [key, value] of entries) {
      if (!value?.url) continue
      compactSnapshot[key] = {
        url: value.url,
        updatedAt: Number(value.updatedAt || Date.now()),
      }
    }

    window.localStorage.setItem(STORY_AUDIO_URL_CACHE_STORAGE_KEY, JSON.stringify(compactSnapshot))
  } catch {
    // Ignore storage write failures.
  }
}

function readStoryAudioCachedUrl(cacheKey: string): string | null {
  const inMemory = storyAudioUrlMemoryCache.get(cacheKey)
  if (inMemory?.url) {
    if (isEphemeralStoryAudioUrl(inMemory.url)) {
      logStoryAudioClient('cache-drop-ephemeral-memory-url', { cacheKey })
      storyAudioUrlMemoryCache.delete(cacheKey)
    } else if (!isCompatibleStoryAudioUrl(inMemory.url)) {
      logStoryAudioClient('cache-drop-incompatible-memory-url', { cacheKey, urlPreview: inMemory.url.slice(0, 120) })
      storyAudioUrlMemoryCache.delete(cacheKey)
    } else {
      logStoryAudioClient('cache-hit-memory-url', { cacheKey })
      return inMemory.url
    }
  }

  const storageSnapshot = getStoryAudioUrlCacheSnapshotFromStorage()
  const fromStorage = storageSnapshot[cacheKey]
  if (!fromStorage?.url) return null

  if (isEphemeralStoryAudioUrl(fromStorage.url)) {
    logStoryAudioClient('cache-drop-ephemeral-storage-url', { cacheKey })
    delete storageSnapshot[cacheKey]
    saveStoryAudioUrlCacheSnapshotToStorage(storageSnapshot)
    return null
  }

  if (!isCompatibleStoryAudioUrl(fromStorage.url)) {
    logStoryAudioClient('cache-drop-incompatible-storage-url', { cacheKey, urlPreview: fromStorage.url.slice(0, 120) })
    delete storageSnapshot[cacheKey]
    saveStoryAudioUrlCacheSnapshotToStorage(storageSnapshot)
    return null
  }

  storyAudioUrlMemoryCache.set(cacheKey, {
    url: fromStorage.url,
    updatedAt: Number(fromStorage.updatedAt || Date.now()),
  })

  return fromStorage.url
}

function writeStoryAudioCachedUrl(cacheKey: string, url: string): void {
  const normalizedUrl = String(url || '').trim()
  if (!normalizedUrl) return

  if (isEphemeralStoryAudioUrl(normalizedUrl)) {
    logStoryAudioClient('cache-skip-ephemeral-url', { cacheKey })
    return
  }

  if (!isCompatibleStoryAudioUrl(normalizedUrl)) {
    logStoryAudioClient('cache-skip-incompatible-url', { cacheKey, urlPreview: normalizedUrl.slice(0, 120) })
    return
  }

  const nextEntry: StoryAudioUrlCacheEntry = {
    url: normalizedUrl,
    updatedAt: Date.now(),
  }

  storyAudioUrlMemoryCache.set(cacheKey, nextEntry)

  const snapshot = getStoryAudioUrlCacheSnapshotFromStorage()
  snapshot[cacheKey] = nextEntry
  saveStoryAudioUrlCacheSnapshotToStorage(snapshot)
}

function isEphemeralStoryAudioUrl(url: string): boolean {
  const normalizedUrl = String(url || '').trim()
  if (!normalizedUrl) return false

  try {
    const parsed = new URL(normalizedUrl)
    const keys = Array.from(parsed.searchParams.keys()).map((key) => key.toLowerCase())
    if (keys.length === 0) return false
    if (keys.includes('token') || keys.includes('expires') || keys.includes('signature')) return true
    if (keys.some((key) => key.startsWith('x-amz-'))) return true
    return true
  } catch {
    return normalizedUrl.includes('?')
  }
}

async function loadStoryAudioManifest(storySlug: string): Promise<StoryAudioManifest | null> {
  const normalizedStorySlug = String(storySlug || '').trim()
  if (!normalizedStorySlug) return null

  const existing = storyAudioManifestPromiseBySlug.get(normalizedStorySlug)
  if (existing) return existing

  const loader = (async () => {
    try {
      storyAudioClientMetrics.manifestLoads += 1
      const response = await fetch(`/chess-story/${normalizedStorySlug}.audio-manifest.json`, {
        method: 'GET',
        cache: 'force-cache',
      })
      if (!response.ok) {
        storyAudioClientMetrics.manifestLoadFailures += 1
        return null
      }
      const parsed = (await response.json()) as StoryAudioManifest
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
        storyAudioClientMetrics.manifestLoadFailures += 1
        return null
      }
      return parsed
    } catch {
      storyAudioClientMetrics.manifestLoadFailures += 1
      return null
    }
  })()

  storyAudioManifestPromiseBySlug.set(normalizedStorySlug, loader)
  return loader
}

async function urlLooksReachable(url: string): Promise<boolean> {
  if (!url) return false

  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    return response.ok
  } catch {
    return false
  }
}

async function resolvePrecomputedStoryAudioUrl(input: {
  storySlug: string
  page: number
  hash: string
  objectPath: string
}): Promise<string | null> {
  const manifest = await loadStoryAudioManifest(input.storySlug)

  const manifestEntry = manifest?.entries?.find((entry) => entry.page === input.page && entry.hash === input.hash)
  const candidateObjectPath = manifestEntry?.objectPath || input.objectPath
  const manifestUrl = manifestEntry?.url
  const fallbackUrl = buildStoryAudioPublicUrlFromObjectPath(candidateObjectPath)
  const candidateUrl = manifestUrl && isCompatibleStoryAudioUrl(manifestUrl) ? manifestUrl : fallbackUrl
  if (manifestUrl && !isCompatibleStoryAudioUrl(manifestUrl)) {
    logStoryAudioClient('precomputed-ignore-incompatible-manifest-url', {
      page: input.page,
      manifestUrlPreview: manifestUrl.slice(0, 120),
    })
  }
  logStoryAudioClient('precomputed-candidate', {
    page: input.page,
    hasManifest: Boolean(manifest),
    hasManifestEntry: Boolean(manifestEntry),
    candidateObjectPath,
    candidateUrlPreview: String(candidateUrl || '').slice(0, 160),
  })
  if (!candidateUrl) return null

  const reachable = await urlLooksReachable(candidateUrl)
  logStoryAudioClient('precomputed-reachability', {
    page: input.page,
    reachable,
    candidateUrlPreview: String(candidateUrl || '').slice(0, 160),
  })
  if (!reachable) return null

  return candidateUrl
}

export async function preloadStoryAudioManifest(storySlug: 'architect-of-squares'): Promise<void> {
  await loadStoryAudioManifest(storySlug)
}

export function __resetStoryAudioCacheForTests(): void {
  storyAudioUrlMemoryCache.clear()
  storyAudioManifestPromiseBySlug.clear()
  storyAudioClientMetrics.ensureApiCalls = 0
  storyAudioClientMetrics.localCacheHits = 0
  storyAudioClientMetrics.precomputedHits = 0
  storyAudioClientMetrics.precomputedMisses = 0
  storyAudioClientMetrics.manifestLoads = 0
  storyAudioClientMetrics.manifestLoadFailures = 0
  forcedPrecomputedOnlyModeForTests = null
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORY_AUDIO_URL_CACHE_STORAGE_KEY)
  }
}

export async function analyzeGameForMe(input: {
  fen: string
  moves: string[]
}): Promise<ChessTutorResult> {
  const headers = await getAuthHeadersAsync(true)

  const response = await request<AnalyzeChessTutorResponse>({
    path: '/api/v1/chess-tutor/analyze',
    method: 'POST',
    headers,
    body: {
      fen: input.fen,
      moves: input.moves,
    },
  })

  if (!response?.success || !response.analysis) {
    throw new Error(response?.error || 'Failed to analyze game')
  }

  return {
    analysis: response.analysis,
    model: response.model || 'gemini',
    apiVersion: response.apiVersion,
  }
}

export async function ensureStoryAudio(input: {
  storySlug: 'architect-of-squares'
  page: number
  totalPages: number
  text: string
  voice?: 'shimmer'
}): Promise<EnsureStoryAudioResult> {
  const voice = input.voice || 'shimmer'
  const { objectPath, hash } = await buildStoryAudioObjectPath({
    storySlug: input.storySlug,
    page: input.page,
    text: input.text,
    totalPages: input.totalPages,
    voice,
  })

  const localCacheKey = `${getStoryAudioCacheNamespace()}|${input.storySlug}|${objectPath}`
  const cachedUrl = readStoryAudioCachedUrl(localCacheKey)
  if (cachedUrl) {
    storyAudioClientMetrics.localCacheHits += 1
    logStoryAudioClient('ensure-return-cached-url', {
      page: input.page,
      objectPath,
      localCacheKey,
    })
    return {
      cached: true,
      url: cachedUrl,
    }
  }

  const precomputedUrl = await resolvePrecomputedStoryAudioUrl({
    storySlug: input.storySlug,
    page: input.page,
    hash,
    objectPath,
  })

  if (precomputedUrl) {
    storyAudioClientMetrics.precomputedHits += 1
    logStoryAudioClient('ensure-return-precomputed-url', {
      page: input.page,
      objectPath,
      localCacheKey,
    })
    writeStoryAudioCachedUrl(localCacheKey, precomputedUrl)
    return {
      cached: true,
      url: precomputedUrl,
    }
  }

  storyAudioClientMetrics.precomputedMisses += 1

  if (isStoryAudioPrecomputedOnlyMode()) {
    logStoryAudioClient('ensure-precomputed-only-miss', {
      page: input.page,
      objectPath,
    })
    throw new Error('Story audio is not precomputed for this page/content. Runtime generation is disabled.')
  }

  let response: EnsureStoryAudioResponse
  try {
    storyAudioClientMetrics.ensureApiCalls += 1
    console.info('[story-audio/client] ensure API fallback call', {
      ensureApiCalls: storyAudioClientMetrics.ensureApiCalls,
      page: input.page,
      storySlug: input.storySlug,
    })
    response = await request<EnsureStoryAudioResponse>({
      path: '/api/v1/public/story-audio/ensure',
      method: 'POST',
      body: {
        storySlug: input.storySlug,
        page: input.page,
        totalPages: input.totalPages,
        text: input.text,
        voice,
      },
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      response = await request<EnsureStoryAudioResponse>({
        path: '/api/public/story-audio/ensure',
        method: 'POST',
        body: {
          storySlug: input.storySlug,
          page: input.page,
          totalPages: input.totalPages,
          text: input.text,
          voice,
        },
      })
    } else {
      throw error
    }
  }

  if (!response?.success || !response.url) {
    logStoryAudioClient('ensure-api-failed', {
      page: input.page,
      objectPath,
      error: response?.error || 'Failed to prepare story audio',
    })
    throw new Error(response?.error || 'Failed to prepare story audio')
  }

  logStoryAudioClient('ensure-api-success', {
    page: input.page,
    objectPath,
    cached: Boolean(response.cached),
    hasAudioBase64: Boolean(response.audioBase64 && response.audioBase64.length > 0),
  })

  writeStoryAudioCachedUrl(localCacheKey, response.url)

  return {
    cached: Boolean(response.cached),
    url: response.url,
    audioBase64: response.audioBase64,
  }
}

export async function getStoryAudioSetupStatus(): Promise<StoryAudioSetupStatus> {
  let response: StoryAudioSetupStatusResponse
  try {
    response = await request<StoryAudioSetupStatusResponse>({
      path: '/api/v1/public/story-audio/status',
      method: 'GET',
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      response = await request<StoryAudioSetupStatusResponse>({
        path: '/api/public/story-audio/status',
        method: 'GET',
      })
    } else {
      throw error
    }
  }

  if (!response?.success || !response.configured || !response.bucket) {
    throw new Error(response?.error || 'Failed to read story-audio setup status')
  }

  return {
    configured: response.configured,
    bucket: response.bucket,
    warnings: response.warnings || [],
  }
}

export function getStoryAudioClientMetrics(): StoryAudioClientMetrics {
  return {
    ensureApiCalls: storyAudioClientMetrics.ensureApiCalls,
    localCacheHits: storyAudioClientMetrics.localCacheHits,
    precomputedHits: storyAudioClientMetrics.precomputedHits,
    precomputedMisses: storyAudioClientMetrics.precomputedMisses,
    manifestLoads: storyAudioClientMetrics.manifestLoads,
    manifestLoadFailures: storyAudioClientMetrics.manifestLoadFailures,
  }
}

export function __setStoryAudioPrecomputedOnlyModeForTests(value: boolean | null): void {
  forcedPrecomputedOnlyModeForTests = value
}
