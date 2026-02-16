import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')

const STORY_AUDIO_BUCKET = 'story-audio'
const STORY_AUDIO_CACHE_VERSION = 'v2'
const DEFAULT_STORY_SLUG = 'architect-of-squares'
const DEFAULT_VOICE = 'shimmer'

function parseArgs(argv) {
  const args = { storySlug: DEFAULT_STORY_SLUG, voice: DEFAULT_VOICE, pdfPath: '', outPath: '' }

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
  }

  return args
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

    entries.push({
      page,
      hash: contentHash,
      objectPath,
      wordCount,
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
}

main().catch((error) => {
  console.error('[story-audio-manifest] Failed:', error)
  process.exitCode = 1
})
