import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)
let cachedSupabaseClient = null
let cachedOpenAiClient = null

function getSupabaseClient() {
  if (!cachedSupabaseClient) {
    cachedSupabaseClient = require('../server/lib/supabaseClient')
  }
  return cachedSupabaseClient
}

function getOpenAiClient() {
  if (!cachedOpenAiClient) {
    const { openai } = require('../server/ai/openaiClient')
    cachedOpenAiClient = openai
  }
  return cachedOpenAiClient
}

const STORY_AUDIO_BUCKET = 'story-audio'
const STORY_AUDIO_CACHE_VERSION = 'v2'
const DEFAULT_STORY_SLUG = 'architect-of-squares'
const DEFAULT_VOICE = 'shimmer'

function parseArgs(argv) {
  const args = {
    storySlug: DEFAULT_STORY_SLUG,
    voice: DEFAULT_VOICE,
    pdfPath: '',
    outPath: '',
    upload: false,
    generateMissing: false,
    failOnMissing: false,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--slug' && argv[index + 1]) {
      args.storySlug = argv[index + 1]
      index += 1
      continue
    }
    if (value === '--voice' && argv[index + 1]) {
      args.voice = argv[index + 1]
      index += 1
      continue
    }
    if (value === '--pdf' && argv[index + 1]) {
      args.pdfPath = argv[index + 1]
      index += 1
      continue
    }
    if (value === '--out' && argv[index + 1]) {
      args.outPath = argv[index + 1]
      index += 1
      continue
    }
    if (value === '--upload') {
      args.upload = true
      continue
    }
    if (value === '--generate-missing') {
      args.generateMissing = true
      continue
    }
    if (value === '--fail-on-missing') {
      args.failOnMissing = true
      continue
    }
  }

  return args
}

function isNotFoundError(error) {
  if (!error || typeof error !== 'object') return false
  const message = String(error.message || '').toLowerCase()
  const statusCode = Number(error.statusCode || error.status || 0)
  return statusCode === 404 || message.includes('not found') || message.includes('does not exist')
}

function normalizeSupabasePublicBaseUrl() {
  const base = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  if (!base) return null
  return base.replace(/\/$/, '')
}

function buildStoryAudioPublicUrl(objectPath) {
  const supabaseBase = normalizeSupabasePublicBaseUrl()
  if (!supabaseBase) return null
  return `${supabaseBase}/storage/v1/object/public/${STORY_AUDIO_BUCKET}/${objectPath}`
}

async function ensureBucketReady() {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.storage.listBuckets()
  if (error) throw new Error(`Unable to list buckets: ${error.message || String(error)}`)

  const existing = Array.isArray(data) ? data.find((entry) => entry?.name === STORY_AUDIO_BUCKET) : null
  if (!existing) {
    const { error: createError } = await supabase.storage.createBucket(STORY_AUDIO_BUCKET, {
      public: true,
      allowedMimeTypes: ['audio/mpeg'],
      fileSizeLimit: '50MB',
    })
    if (createError) {
      const message = String(createError.message || '')
      if (!message.toLowerCase().includes('already exists')) {
        throw new Error(`Unable to create bucket ${STORY_AUDIO_BUCKET}: ${createError.message || String(createError)}`)
      }
    }
    return
  }

  if (existing.public === false && typeof supabase.storage.updateBucket === 'function') {
    const { error: updateError } = await supabase.storage.updateBucket(STORY_AUDIO_BUCKET, {
      public: true,
      allowedMimeTypes: ['audio/mpeg'],
      fileSizeLimit: '50MB',
    })
    if (updateError) {
      throw new Error(`Unable to make bucket ${STORY_AUDIO_BUCKET} public: ${updateError.message || String(updateError)}`)
    }
  }
}

async function objectExists(objectPath) {
  const supabase = getSupabaseClient()
  const { error } = await supabase.storage.from(STORY_AUDIO_BUCKET).download(objectPath)
  if (!error) return true
  if (isNotFoundError(error)) return false

  const publicUrl = buildStoryAudioPublicUrl(objectPath)
  if (publicUrl && typeof fetch === 'function') {
    try {
      const response = await fetch(publicUrl, { method: 'HEAD', cache: 'no-store' })
      if (response.status === 400 || response.status === 404) return false
      if (response.ok) return true
    } catch {
      // Fall through to throw with original storage error details.
    }
  }

  throw new Error(`Unable to check object ${objectPath}: ${error.message || String(error)}`)
}

async function generateStoryAudioBuffer({ text, voice }) {
  const openai = getOpenAiClient()
  if (!openai?.audio?.speech?.create || typeof openai.audio.speech.create !== 'function') {
    throw new Error('OpenAI TTS is unavailable. Set OPENAI_API_KEY and AI_ENABLED=true for generation.')
  }

  const ttsResponse = await openai.audio.speech.create({
    model: 'tts-1',
    voice,
    input: text,
    format: 'mp3',
  })

  const audioArrayBuffer = await ttsResponse.arrayBuffer()
  return Buffer.from(audioArrayBuffer)
}

async function uploadStoryAudio({ objectPath, audioBuffer }) {
  const supabase = getSupabaseClient()
  const { error } = await supabase.storage.from(STORY_AUDIO_BUCKET).upload(objectPath, audioBuffer, {
    contentType: 'audio/mpeg',
    upsert: false,
    cacheControl: '31536000',
  })

  if (!error) return

  const message = String(error.message || '').toLowerCase()
  const statusCode = Number(error.statusCode || 0)
  if (statusCode === 409 || message.includes('already exists')) return

  throw new Error(`Upload failed for ${objectPath}: ${error.message || String(error)}`)
}

function normalizeNarrationText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildStoryAudioContentHash({ text, totalPages, voice }) {
  const payload = JSON.stringify({
    version: STORY_AUDIO_CACHE_VERSION,
    text: normalizeNarrationText(text),
    totalPages: Number(totalPages || 1),
    voice: String(voice || DEFAULT_VOICE),
  })

  return createHash('sha256').update(payload).digest('hex').slice(0, 16)
}

function buildStoryAudioObjectPath({ storySlug, page, text, totalPages, voice }) {
  const contentHash = buildStoryAudioContentHash({ text, totalPages, voice })
  return {
    contentHash,
    objectPath: `${storySlug}/${STORY_AUDIO_CACHE_VERSION}/page-${page}-${contentHash}.mp3`,
  }
}

async function main() {
  const args = parseArgs(process.argv)

  const resolvedPdfPath = args.pdfPath
    ? path.resolve(workspaceRoot, args.pdfPath)
    : path.resolve(workspaceRoot, 'public', 'chess-story', `${args.storySlug}.pdf`)

  const resolvedOutPath = args.outPath
    ? path.resolve(workspaceRoot, args.outPath)
    : path.resolve(workspaceRoot, 'public', 'chess-story', `${args.storySlug}.audio-manifest.json`)

  const pdfBytes = new Uint8Array(await readFile(resolvedPdfPath))
  const loadingTask = getDocument({ data: pdfBytes })
  const documentProxy = await loadingTask.promise

  if (args.upload) {
    await ensureBucketReady()
  }

  const stats = {
    pages: documentProxy.numPages,
    existing: 0,
    generated: 0,
    missing: 0,
    emptyTextSkipped: 0,
  }

  const entries = []

  for (let page = 1; page <= documentProxy.numPages; page += 1) {
    const pdfPage = await documentProxy.getPage(page)
    const textContent = await pdfPage.getTextContent()
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    const { contentHash, objectPath } = buildStoryAudioObjectPath({
      storySlug: args.storySlug,
      page,
      text,
      totalPages: documentProxy.numPages,
      voice: args.voice,
    })

    const wordCount = normalizeNarrationText(text).split(/\s+/).filter((word) => word.length > 0).length

    let availability = 'unknown'

    if (args.upload) {
      if (wordCount === 0) {
        availability = 'empty-text-skip'
        stats.emptyTextSkipped += 1
      } else {
        const exists = await objectExists(objectPath)
        if (exists) {
          availability = 'existing'
          stats.existing += 1
        } else if (args.generateMissing) {
          const audioBuffer = await generateStoryAudioBuffer({ text, voice: args.voice })
          await uploadStoryAudio({ objectPath, audioBuffer })
          availability = 'generated'
          stats.generated += 1
        } else {
          availability = 'missing'
          stats.missing += 1
        }
      }
    }

    entries.push({
      page,
      hash: contentHash,
      objectPath,
      url: buildStoryAudioPublicUrl(objectPath),
      wordCount,
      availability,
    })
  }

  await loadingTask.destroy()

  const manifest = {
    storySlug: args.storySlug,
    voice: args.voice,
    cacheVersion: STORY_AUDIO_CACHE_VERSION,
    bucket: STORY_AUDIO_BUCKET,
    totalPages: documentProxy.numPages,
    generatedAt: new Date().toISOString(),
    entries,
  }

  await writeFile(resolvedOutPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  console.log(`[story-audio-manifest] Wrote ${entries.length} entries to ${resolvedOutPath}`)
  console.log('[story-audio-manifest] Summary:', stats)

  if (args.failOnMissing && stats.missing > 0) {
    throw new Error(`Missing ${stats.missing} story-audio files in Supabase. Re-run with --generate-missing or upload assets.`)
  }
}

main().catch((error) => {
  console.error('[story-audio-manifest] Failed:', error)
  process.exitCode = 1
})
