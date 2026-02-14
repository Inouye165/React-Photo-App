import 'dotenv/config'
import knex from 'knex'

type UserRow = {
  id: string
  created_at: string | null
}

type PhotoRow = {
  id: number
  user_id: string | null
  state: string | null
  filename: string | null
  storage_path: string | null
}

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  useNullAsDefault: true,
})

async function checkAuthState() {
  console.log('=== Checking Authentication State ===\n')

  const users = await db<UserRow>('users').select('*')
  console.log(`Found ${users.length} users in database:`)
  users.forEach((user) => {
    console.log(`  - ID: ${user.id}`)
    console.log(`    Created: ${user.created_at}`)
  })

  console.log('\n=== Photo 108 Details ===')
  const photo = await db<PhotoRow>('photos').where('id', 108).first()
  if (photo) {
    console.log(`  Owner ID: ${photo.user_id}`)
    console.log(`  State: ${photo.state}`)
    console.log(`  Filename: ${photo.filename}`)
    console.log(`  Storage Path: ${photo.storage_path}`)

    const matchingUser = users.find((user) => user.id === photo.user_id)
    if (matchingUser) {
      console.log('  ✅ User record exists for this photo')
    } else {
      console.log("  ❌ No user record for this photo's user_id")
    }
  } else {
    console.log('  Photo 108 not found')
  }

  await db.destroy()
}

checkAuthState().catch(async (error: unknown) => {
  console.error('Error:', error)
  await db.destroy()
  process.exit(1)
})
