import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./auth', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test' }),
}))

vi.mock('./httpClient', async () => {
  const actual = await vi.importActual<typeof import('./httpClient')>('./httpClient')
  return {
    ...actual,
    request: vi.fn(),
    API_BASE_URL: 'http://localhost:1234',
  }
})

import { uploadPhotoToServer } from './uploads'
import { request, ApiError } from './httpClient'

describe('uploadPhotoToServer error mapping', () => {
  const requestMock = request as unknown as ReturnType<typeof vi.fn>

  beforeEach(() => {
    requestMock.mockReset()
  })

  it('maps 413/LIMIT_FILE_SIZE to a friendly message', async () => {
    requestMock.mockRejectedValue(
      new ApiError('File too large', { status: 413, details: { code: 'LIMIT_FILE_SIZE' } }),
    )

    const file = new File(['x'], 'big.jpg', { type: 'image/jpeg' })
    await expect(uploadPhotoToServer(file)).rejects.toThrow('File is too large')
  })

  it('maps INVALID_FILE_SIGNATURE to a friendly message', async () => {
    requestMock.mockRejectedValue(
      new ApiError('File is not a valid image', { status: 415, details: { code: 'INVALID_FILE_SIGNATURE' } }),
    )

    const file = new File(['x'], 'bad.heic', { type: 'image/heic' })
    await expect(uploadPhotoToServer(file)).rejects.toThrow('That file does not appear to be a valid image')
  })

  it('maps 5xx to a generic server error message', async () => {
    requestMock.mockRejectedValue(new ApiError('Internal error', { status: 500, details: { code: 'UPLOAD_FAILED' } }))

    const file = new File(['x'], 'ok.jpg', { type: 'image/jpeg' })
    await expect(uploadPhotoToServer(file)).rejects.toThrow('Server error while uploading')
  })
})
