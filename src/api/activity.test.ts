import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the httpClient module
const mockRequest = vi.fn()
vi.mock('./httpClient', () => ({
  request: (...args: unknown[]) => mockRequest(...args),
}))

// Mock the auth module
vi.mock('./auth', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
}))

import { logActivity, fetchActivityLog } from './activity'

describe('activity API', () => {
  beforeEach(() => {
    mockRequest.mockReset()
  })

  describe('logActivity', () => {
    it('sends a POST request with the action', async () => {
      mockRequest.mockResolvedValueOnce({ success: true })

      await logActivity('sign_in')

      expect(mockRequest).toHaveBeenCalledWith({
        path: '/api/v1/activity',
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
        body: { action: 'sign_in', metadata: {} },
      })
    })

    it('includes metadata when provided', async () => {
      mockRequest.mockResolvedValueOnce({ success: true })

      await logActivity('page_view', { page: 'gallery' })

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { action: 'page_view', metadata: { page: 'gallery' } },
        }),
      )
    })

    it('does not throw when the request fails', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Network error'))

      // Should not throw
      await expect(logActivity('sign_in')).resolves.toBeUndefined()
    })
  })

  describe('fetchActivityLog', () => {
    it('sends a GET request with default limit/offset', async () => {
      mockRequest.mockResolvedValueOnce({ success: true, data: [] })

      const result = await fetchActivityLog()

      expect(mockRequest).toHaveBeenCalledWith({
        path: '/api/v1/activity?limit=50&offset=0',
        method: 'GET',
        headers: { Authorization: 'Bearer test-token' },
      })
      expect(result).toEqual([])
    })

    it('passes custom limit and offset', async () => {
      mockRequest.mockResolvedValueOnce({ success: true, data: [{ id: '1' }] })

      const result = await fetchActivityLog(10, 5)

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/v1/activity?limit=10&offset=5',
        }),
      )
      expect(result).toEqual([{ id: '1' }])
    })

    it('returns empty array when response has no data', async () => {
      mockRequest.mockResolvedValueOnce({ success: true })

      const result = await fetchActivityLog()
      expect(result).toEqual([])
    })
  })
})
