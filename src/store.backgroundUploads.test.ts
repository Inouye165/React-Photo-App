import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('store backgroundUploads', () => {
  let useStore: typeof import('./store').default

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    // Import the real store (not the globally mocked one).
    ;({ default: useStore } = await vi.importActual('./store'))

    useStore.setState({
      backgroundUploads: [],
    })
  })

  it('adds background uploads and tracks per-file status', () => {
    const fileA = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
    const fileB = new File(['b'], 'b.jpg', { type: 'image/jpeg' })

    const ids = useStore.getState().addBackgroundUploads([fileA, fileB], 'scenery')
    expect(ids).toHaveLength(2)

    const entries = useStore.getState().backgroundUploads
    expect(entries).toHaveLength(2)
    expect(entries[0]?.status).toBe('uploading')

    useStore.getState().markBackgroundUploadSuccess(ids[0]!)
    useStore.getState().markBackgroundUploadError(ids[1]!, 'nope')

    const updated = useStore.getState().backgroundUploads
    const first = updated.find((u) => u.id === ids[0])
    const second = updated.find((u) => u.id === ids[1])

    expect(first?.status).toBe('success')
    expect(second?.status).toBe('error')
    expect(second?.errorMessage).toBe('nope')
  })

  it('clears completed uploads and retries failed uploads', () => {
    const fileA = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
    const fileB = new File(['b'], 'b.jpg', { type: 'image/jpeg' })

    const ids = useStore.getState().addBackgroundUploads([fileA, fileB], 'receipt')
    useStore.getState().markBackgroundUploadSuccess(ids[0]!)
    useStore.getState().markBackgroundUploadError(ids[1]!, 'fail')

    useStore.getState().clearCompletedBackgroundUploads()
    expect(useStore.getState().backgroundUploads).toHaveLength(1)
    expect(useStore.getState().backgroundUploads[0]?.status).toBe('error')

    const retriedIds = useStore.getState().retryFailedBackgroundUploads()
    expect(retriedIds).toEqual([ids[1]])

    const afterRetry = useStore.getState().backgroundUploads.find((u) => u.id === ids[1])
    expect(afterRetry?.status).toBe('uploading')
    expect(afterRetry?.errorMessage).toBeUndefined()
  })
})
