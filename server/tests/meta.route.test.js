const request = require('supertest')
const express = require('express')

const createMetaRouter = require('../routes/meta')
const { resolveBuildId } = require('../utils/buildId')

function createTestApp() {
  const app = express()
  app.use('/api/meta', createMetaRouter())
  return app
}

describe('GET /api/meta', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('returns buildId and no-store cache control', async () => {
    process.env.BUILD_ID = 'build-123'
    const app = createTestApp()

    const response = await request(app).get('/api/meta').expect(200)

    expect(response.body.buildId).toBe('build-123')
    expect(typeof response.body.bootId).toBe('string')
    expect(response.body.bootId.length).toBeGreaterThan(0)
    expect(response.headers['cache-control']).toMatch(/no-store/i)
  })

  test('falls back to CI commit identifiers', async () => {
    delete process.env.BUILD_ID
    process.env.GITHUB_SHA = 'commit-sha-1'

    const app = createTestApp()
    const response = await request(app).get('/api/meta').expect(200)

    expect(typeof response.body.buildId).toBe('string')
    expect(response.body.buildId).toBe(resolveBuildId())
    expect(typeof response.body.bootId).toBe('string')
  })

  test('bootId is stable across requests in a single process', async () => {
    const app = createTestApp()
    const first = await request(app).get('/api/meta').expect(200)
    const second = await request(app).get('/api/meta').expect(200)

    expect(first.body.bootId).toBe(second.body.bootId)
  })
})
