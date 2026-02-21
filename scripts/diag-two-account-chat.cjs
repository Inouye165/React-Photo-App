const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  const out = {}
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i <= 0) continue
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const env = readEnv(path.join(process.cwd(), '.env'))
  const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY

  if (!url || !anon) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  }

  const token = Date.now()
  const password = 'DesktopTest123!'
  const emailA = `chatdiag+a-${token}@example.com`
  const emailB = `chatdiag+b-${token}@example.com`

  const clientA = createClient(url, anon)
  const clientB = createClient(url, anon)

  console.log('[diag] Creating test accounts...')
  const signUpA = await clientA.auth.signUp({ email: emailA, password })
  if (signUpA.error) throw signUpA.error
  const signUpB = await clientB.auth.signUp({ email: emailB, password })
  if (signUpB.error) throw signUpB.error

  const signInA = await clientA.auth.signInWithPassword({ email: emailA, password })
  if (signInA.error) throw signInA.error
  const signInB = await clientB.auth.signInWithPassword({ email: emailB, password })
  if (signInB.error) throw signInB.error

  const userA = signInA.data.user
  const userB = signInB.data.user
  if (!userA || !userB) throw new Error('Failed to sign in both users')

  console.log('[diag] Users:', { userA: userA.id, userB: userB.id })

  const roomInsert = await clientA
    .from('rooms')
    .insert({
      type: 'private',
      created_by: userA.id,
      is_group: false,
      name: `diag-${token}`,
      metadata: {},
    })
    .select('id, created_by, name')
    .single()

  if (roomInsert.error) throw roomInsert.error
  const roomId = roomInsert.data.id
  console.log('[diag] Room created:', roomId)

  const memberInsert = await clientA.from('room_members').insert([
    { room_id: roomId, user_id: userA.id, is_owner: true },
    { room_id: roomId, user_id: userB.id, is_owner: false },
  ])
  if (memberInsert.error) throw memberInsert.error

  const receivedByB = []
  const receivedByA = []
  let statusB = null
  let statusA = null

  const channelB = clientB
    .channel(`diag-chat-b-${token}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      (payload) => {
        receivedByB.push(payload.new)
      }
    )

  const channelA = clientA
    .channel(`diag-chat-a-${token}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      (payload) => {
        receivedByA.push(payload.new)
      }
    )

  const subscribe = (channel, setStatus, label) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`subscribe timeout (${label})`)), 10000)
      channel.subscribe((s, err) => {
        setStatus(s)
        if (s === 'SUBSCRIBED') {
          clearTimeout(timeout)
          resolve()
        }
        if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
          clearTimeout(timeout)
          reject(err || new Error(`subscribe failed (${label}): ${s}`))
        }
      })
    })

  await Promise.all([
    subscribe(channelA, (s) => {
      statusA = s
    }, 'A'),
    subscribe(channelB, (s) => {
      statusB = s
    }, 'B'),
  ])

  console.log('[diag] Realtime status:', { statusA, statusB })

  const sendA = await clientA
    .from('messages')
    .insert({ room_id: roomId, sender_id: userA.id, content: `hello-${token}` })
    .select('id, room_id, sender_id, content, created_at')
    .single()

  if (sendA.error) throw sendA.error
  console.log('[diag] Message sent A->B:', sendA.data.id)

  for (let i = 0; i < 20 && receivedByB.length === 0; i += 1) {
    await wait(250)
  }

  const sendB = await clientB
    .from('messages')
    .insert({ room_id: roomId, sender_id: userB.id, content: `reply-${token}` })
    .select('id, room_id, sender_id, content, created_at')
    .single()

  if (sendB.error) throw sendB.error
  console.log('[diag] Message sent B->A:', sendB.data.id)

  for (let i = 0; i < 20; i += 1) {
    await wait(250)
  }

  const fetchB = await clientB
    .from('messages')
    .select('id, room_id, sender_id, content, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })

  if (fetchB.error) throw fetchB.error

  await clientA.removeChannel(channelA)
  await clientB.removeChannel(channelB)

  const byAFromB = receivedByA.some((row) => row && row.sender_id === userB.id)
  const byBFromA = receivedByB.some((row) => row && row.sender_id === userA.id)

  console.log('[diag] RESULT')
  console.log(
    JSON.stringify(
      {
        emails: { emailA, emailB },
        userIds: { userA: userA.id, userB: userB.id },
        roomId,
        subscribeStatus: { statusA, statusB },
        sentMessageIds: { aToB: sendA.data.id, bToA: sendB.data.id },
        realtimeReceived: {
          byA_any: receivedByA.length > 0,
          byB_any: receivedByB.length > 0,
          byA_fromB: byAFromB,
          byB_fromA: byBFromA,
        },
        receivedPayloads: { byA: receivedByA, byB: receivedByB },
        fetchedCountForB: fetchB.data?.length || 0,
        fetchedMessagesForB: fetchB.data || [],
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error('[diag] FAILED:', err?.message || err)
  process.exit(1)
})
