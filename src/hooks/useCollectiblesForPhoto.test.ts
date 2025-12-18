/**
 * Tests for useCollectiblesForPhoto hook
 * Phase 2: Comprehensive coverage of collectibles logic extracted from EditPage
 */

import { renderHook, waitFor } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCollectiblesForPhoto } from './useCollectiblesForPhoto'
import * as api from '../api'
import type { Photo } from '../types/photo'
import type { CollectibleRecord } from '../types/collectibles'

// Mock API functions
vi.mock('../api', async (importOriginal) => {
  const actual = (await importOriginal()) as unknown as Record<string, unknown>
  return {
    ...(actual || {}),
    fetchCollectibles: vi.fn(),
    upsertCollectible: vi.fn(),
  }
})

describe('useCollectiblesForPhoto', () => {
  const mockPhoto: Photo = {
    id: 123,
    url: '/photos/123.jpg',
    filename: 'test.jpg',
  }

  const mockCollectibleData: CollectibleRecord = {
    id: 1,
    photo_id: 123,
    category: 'Comic Book',
    name: 'Amazing Spider-Man #1',
    conditionLabel: 'Excellent',
    valueMin: 100,
    valueMax: 500,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Fetch Lifecycle', () => {
    test('fetches collectibles when enabled and photo.id exists', async () => {
      vi.mocked(api.fetchCollectibles).mockResolvedValue([mockCollectibleData])

      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: true })
      )

      // Initial loading state may be false before effect runs
      // Wait for fetch to be called
      await waitFor(() => {
        expect(api.fetchCollectibles).toHaveBeenCalledWith(123)
      })

      // Wait for loading to complete and data to be set
      await waitFor(() => {
        expect(result.current.collectibleData).toEqual(mockCollectibleData)
        expect(result.current.collectibleLoading).toBe(false)
      })
    })

    test('does not fetch when enabled is false', async () => {
      vi.mocked(api.fetchCollectibles).mockResolvedValue([])

      renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: false })
      )

      await waitFor(() => {
        expect(api.fetchCollectibles).not.toHaveBeenCalled()
      })
    })

    test('does not fetch when photo.id is missing', async () => {
      vi.mocked(api.fetchCollectibles).mockResolvedValue([])

      const photoWithoutId = { ...mockPhoto, id: undefined as any }

      renderHook(() =>
        useCollectiblesForPhoto({ photo: photoWithoutId, enabled: true })
      )

      await waitFor(() => {
        expect(api.fetchCollectibles).not.toHaveBeenCalled()
      })
    })

    test('shows loading state while fetching', async () => {
      let resolveCollectibles: any
      const collectiblesPromise = new Promise<CollectibleRecord[]>(resolve => {
        resolveCollectibles = resolve
      })
      vi.mocked(api.fetchCollectibles).mockReturnValue(collectiblesPromise)

      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: true })
      )

      // Initial state should be loading (will become true after fetch starts)
      await waitFor(() => {
        expect(result.current.collectibleLoading).toBe(true)
      })

      // Resolve the promise
      resolveCollectibles([mockCollectibleData])

      await waitFor(() => {
        expect(result.current.collectibleLoading).toBe(false)
        expect(result.current.collectibleData).toEqual(mockCollectibleData)
      })
    })

    test('fetches only once per photo id (fetch-once behavior)', async () => {
      vi.mocked(api.fetchCollectibles).mockResolvedValue([mockCollectibleData])

      const { rerender } = renderHook(
        ({ photo, enabled }) => useCollectiblesForPhoto({ photo, enabled }),
        { initialProps: { photo: mockPhoto, enabled: true } }
      )

      await waitFor(() => {
        expect(api.fetchCollectibles).toHaveBeenCalledTimes(1)
      })

      // Rerender with same photo
      rerender({ photo: mockPhoto, enabled: true })

      await waitFor(() => {
        // Should still only be called once
        expect(api.fetchCollectibles).toHaveBeenCalledTimes(1)
      })
    })

    test('refetches when photo id changes', async () => {
      vi.mocked(api.fetchCollectibles).mockResolvedValue([mockCollectibleData])

      const { rerender } = renderHook(
        ({ photo, enabled }) => useCollectiblesForPhoto({ photo, enabled }),
        { initialProps: { photo: mockPhoto, enabled: true } }
      )

      await waitFor(() => {
        expect(api.fetchCollectibles).toHaveBeenCalledWith(123)
        expect(api.fetchCollectibles).toHaveBeenCalledTimes(1)
      })

      // Change photo id
      const newPhoto: Photo = { ...mockPhoto, id: 456 }
      const newCollectible: CollectibleRecord = { ...mockCollectibleData, id: 2, photo_id: 456 }
      vi.mocked(api.fetchCollectibles).mockResolvedValue([newCollectible])

      rerender({ photo: newPhoto, enabled: true })

      await waitFor(() => {
        expect(api.fetchCollectibles).toHaveBeenCalledWith(456)
        expect(api.fetchCollectibles).toHaveBeenCalledTimes(2)
      })
    })

    test('handles fetch error gracefully (logs debug, sets loading false)', async () => {
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      vi.mocked(api.fetchCollectibles).mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: true })
      )

      await waitFor(() => {
        expect(api.fetchCollectibles).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(result.current.collectibleLoading).toBe(false)
        expect(result.current.collectibleData).toBeNull()
        expect(consoleDebugSpy).toHaveBeenCalledWith(
          '[useCollectiblesForPhoto] No collectible data found:',
          'Network error'
        )
      })

      consoleDebugSpy.mockRestore()
    })

    test('uses first collectible when multiple returned', async () => {
      const collectibles: CollectibleRecord[] = [
        mockCollectibleData,
        { ...mockCollectibleData, id: 2, name: 'Second Item' },
      ]
      vi.mocked(api.fetchCollectibles).mockResolvedValue(collectibles)

      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: true })
      )

      await waitFor(() => {
        expect(result.current.collectibleData).toEqual(mockCollectibleData)
      })
    })
  })

  describe('Derived Values', () => {
    test('isCollectiblePhoto is true when classification is "collectables"', () => {
      const photo: Photo = { ...mockPhoto, classification: 'collectables' }
      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo, enabled: true })
      )

      expect(result.current.isCollectiblePhoto).toBe(true)
    })

    test('isCollectiblePhoto is true when classification is "collectible"', () => {
      const photo: Photo = { ...mockPhoto, classification: 'collectible' }
      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo, enabled: true })
      )

      expect(result.current.isCollectiblePhoto).toBe(true)
    })

    test('isCollectiblePhoto is true when ai_analysis.classification is "collectables"', () => {
      const photo: Photo = {
        ...mockPhoto,
        ai_analysis: { classification: 'collectables' },
      }
      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo, enabled: true })
      )

      expect(result.current.isCollectiblePhoto).toBe(true)
    })

    test('isCollectiblePhoto is false for non-collectible classifications', () => {
      const photo: Photo = { ...mockPhoto, classification: 'landscape' }
      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo, enabled: true })
      )

      expect(result.current.isCollectiblePhoto).toBe(false)
    })

    test('hasCollectibleData is true when collectibleData exists', async () => {
      vi.mocked(api.fetchCollectibles).mockResolvedValue([mockCollectibleData])

      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: true })
      )

      await waitFor(() => {
        expect(result.current.hasCollectibleData).toBe(true)
      })
    })

    test('hasCollectibleData is false when collectibleData is null', () => {
      vi.mocked(api.fetchCollectibles).mockResolvedValue([])

      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: true })
      )

      expect(result.current.hasCollectibleData).toBe(false)
    })

    test('showCollectiblesTab is true when enabled and isCollectiblePhoto', () => {
      const photo: Photo = { ...mockPhoto, classification: 'collectible' }
      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo, enabled: true })
      )

      expect(result.current.showCollectiblesTab).toBe(true)
    })

    test('showCollectiblesTab is false when not enabled', () => {
      const photo: Photo = { ...mockPhoto, classification: 'collectible' }
      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo, enabled: false })
      )

      expect(result.current.showCollectiblesTab).toBe(false)
    })

    test('collectibleAiAnalysis extracts from poi_analysis', () => {
      const aiAnalysis = { category: 'Comic Book', confidence: 0.95 }
      const photo: Photo = { ...mockPhoto, poi_analysis: aiAnalysis }
      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo, enabled: true })
      )

      expect(result.current.collectibleAiAnalysis).toEqual(aiAnalysis)
    })

    test('collectibleAiAnalysis fallback to ai_analysis.collectibleInsights', () => {
      const aiAnalysis = { category: 'Trading Cards', confidence: 0.88 }
      const photo: Photo = {
        ...mockPhoto,
        ai_analysis: { collectibleInsights: aiAnalysis },
      }
      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo, enabled: true })
      )

      expect(result.current.collectibleAiAnalysis).toEqual(aiAnalysis)
    })

    test('collectibleAiAnalysis is null when not present', () => {
      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: true })
      )

      expect(result.current.collectibleAiAnalysis).toBeNull()
    })
  })

  describe('Save Collectible', () => {
    test('saveCollectible calls upsertCollectible with correct payload', async () => {
      const formState = {
        category: 'Coins',
        name: '1964 Silver Quarter',
        conditionLabel: 'Mint',
        valueMin: 50,
        valueMax: 100,
        specifics: { mint: 'D', year: 1964 },
      }

      vi.mocked(api.upsertCollectible).mockResolvedValue(mockCollectibleData)

      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: true })
      )

      // Set form state and wait for it to update
      result.current.handleCollectibleChange(formState)
      
      await waitFor(() => {
        expect(result.current.collectibleFormState).toEqual(formState)
      })

      // Call save
      const saved = await result.current.saveCollectible()

      expect(api.upsertCollectible).toHaveBeenCalledWith(
        123,
        {
          formState: {
            category: 'Coins',
            name: '1964 Silver Quarter',
            conditionLabel: 'Mint',
            valueMin: 50,
            valueMax: 100,
            specifics: { mint: 'D', year: 1964 },
          },
        },
        { recordAi: true }
      )

      expect(saved).toEqual(mockCollectibleData)
    })

    test('saveCollectible updates collectibleData on success', async () => {
      const formState = {
        category: 'Toys',
        name: 'G.I. Joe Action Figure',
      }

      vi.mocked(api.upsertCollectible).mockResolvedValue(mockCollectibleData)

      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: true })
      )

      result.current.handleCollectibleChange(formState)

      await waitFor(() => {
        expect(result.current.collectibleFormState).toEqual(formState)
      })

      await result.current.saveCollectible()

      await waitFor(() => {
        expect(result.current.collectibleData).toEqual(mockCollectibleData)
      })
    })

    test('saveCollectible returns undefined when collectibleFormState is null', async () => {
      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: true })
      )

      const saved = await result.current.saveCollectible()

      expect(saved).toBeUndefined()
      expect(api.upsertCollectible).not.toHaveBeenCalled()
    })

    test('saveCollectible returns undefined when photo.id is missing', async () => {
      const photoWithoutId = { ...mockPhoto, id: undefined as any }

      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: photoWithoutId, enabled: true })
      )

      result.current.handleCollectibleChange({ category: 'Test' })

      const saved = await result.current.saveCollectible()

      expect(saved).toBeUndefined()
      expect(api.upsertCollectible).not.toHaveBeenCalled()
    })

    test('saveCollectible throws error when upsertCollectible fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const formState = { category: 'Test', name: 'Test Item' }

      vi.mocked(api.upsertCollectible).mockRejectedValue(new Error('Save failed'))

      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: true })
      )

      result.current.handleCollectibleChange(formState)

      await waitFor(() => {
        expect(result.current.collectibleFormState).toEqual(formState)
      })

      await expect(result.current.saveCollectible()).rejects.toThrow('Save failed')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[useCollectiblesForPhoto] Failed to save collectible:',
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Form State Management', () => {
    test('handleCollectibleChange updates collectibleFormState', async () => {
      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: true })
      )

      const formState = { category: 'Comic Book', name: 'Test Comic' }
      result.current.handleCollectibleChange(formState)

      await waitFor(() => {
        expect(result.current.collectibleFormState).toEqual(formState)
      })
    })

    test('setCollectibleViewMode updates viewMode', async () => {
      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: true })
      )

      expect(result.current.collectibleViewMode).toBe('view')

      result.current.setCollectibleViewMode('edit')

      await waitFor(() => {
        expect(result.current.collectibleViewMode).toBe('edit')
      })
    })
  })

  describe('Integration: EditPage Non-Blocking Save', () => {
    test('upsert failure does not prevent metadata save (simulated)', async () => {
      // This test simulates the EditPage behavior where collectibles save
      // failure is caught and logged as warning, not propagated
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const formState = { category: 'Test' }

      vi.mocked(api.upsertCollectible).mockRejectedValue(new Error('Upsert failed'))

      const { result } = renderHook(() =>
        useCollectiblesForPhoto({ photo: mockPhoto, enabled: true })
      )

      result.current.handleCollectibleChange(formState)

      await waitFor(() => {
        expect(result.current.collectibleFormState).toEqual(formState)
      })

      let saveError: any
      try {
        await result.current.saveCollectible()
      } catch (err) {
        saveError = err
      }

      // Expect error to be thrown (EditPage catches it)
      expect(saveError).toBeInstanceOf(Error)
      expect(saveError.message).toBe('Upsert failed')

      // EditPage would catch this and log as warning, allowing metadata save to proceed
      // This confirms the hook behaves correctly for non-blocking pattern

      consoleWarnSpy.mockRestore()
    })
  })
})
