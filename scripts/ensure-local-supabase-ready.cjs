#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const repoRoot = process.cwd()
const envPath = path.join(repoRoot, '.env')

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  const out = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function isLocalSupabaseUrl(value) {
  if (!value) return false
  try {
    const parsed = new URL(value)
    const localHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
    return localHost && parsed.port === '54321'
  } catch {
    return false
  }
}

async function checkAuthHealth(baseUrl) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/auth/v1/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
    return res.status >= 200 && res.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

function hasSupabaseCli() {
  const result = spawnSync('supabase', ['--version'], { stdio: 'ignore', shell: true })
  return result.status === 0
}

function startSupabase() {
  const result = spawnSync('supabase', ['start'], {
    stdio: 'inherit',
    shell: true,
    cwd: repoRoot
  })
  return result.status === 0
}

async function waitForSupabase(baseUrl, attempts = 45, delayMs = 2000) {
  for (let i = 0; i < attempts; i++) {
    if (await checkAuthHealth(baseUrl)) return true
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return false
}

async function main() {
  const fileEnv = parseDotEnv(envPath)
  const supabaseUrl = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || ''

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    return
  }

  const healthOk = await checkAuthHealth(supabaseUrl)
  if (healthOk) {
    console.log('[predev] Local Supabase auth is reachable.')
    return
  }

  console.log('[predev] Local Supabase auth is down; ensuring local Supabase stack is running...')

  if (!hasSupabaseCli()) {
    console.error('[predev] Supabase CLI not found. Install Supabase CLI or set VITE_SUPABASE_URL to a reachable host.')
    process.exit(1)
  }

  const started = startSupabase()
  if (!started) {
    console.error('[predev] Failed to run `supabase start`.')
    process.exit(1)
  }

  const ready = await waitForSupabase(supabaseUrl)
  if (!ready) {
    console.error('[predev] Supabase started, but auth health endpoint did not become ready in time.')
    process.exit(1)
  }

  console.log('[predev] Local Supabase auth is ready.')
}

main().catch((err) => {
  console.error('[predev] Unexpected error while checking local Supabase:', err?.message || err)
  process.exit(1)
})
