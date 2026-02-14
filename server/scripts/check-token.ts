#!/usr/bin/env node

import jwt, { type JwtPayload } from 'jsonwebtoken'

const token = process.argv[2]
if (!token) {
  console.error('Usage: node scripts/check-token.ts <token>')
  process.exit(1)
}

try {
  const decoded = jwt.decode(token)
  console.log('\n=== Token Claims ===\n')
  console.log(JSON.stringify(decoded, null, 2))

  const sub = (decoded && typeof decoded === 'object' && 'sub' in decoded)
    ? (decoded as JwtPayload).sub
    : undefined

  console.log('\n=== User ID ===')
  console.log(`sub: ${String(sub ?? 'undefined')}`)
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  console.error('Error decoding token:', message)
}
