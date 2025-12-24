import type { CollectibleFormState, CollectibleRecord } from '../types/collectibles'
import type { Photo } from '../types/photo'
import { request, ApiError } from './httpClient'
import { getAuthHeaders, getHeadersForGetRequestAsync } from './auth'

type PhotoId = Photo['id']
export type CollectibleId = CollectibleRecord['id']

export async function fetchCollectibles(photoId: PhotoId): Promise<CollectibleRecord[] | undefined> {
  try {
    const headers = await getHeadersForGetRequestAsync()
    const json = await request<{ success: boolean; error?: string; collectibles?: CollectibleRecord[] }>({
      path: `/photos/${photoId}/collectibles`,
      headers,
    })
    if (!json.success) throw new Error(json.error || 'Failed to fetch collectibles')
    return json.collectibles || []
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return undefined
    throw error
  }
}

export async function createCollectible(
  photoId: PhotoId,
  data: Partial<CollectibleRecord>,
): Promise<CollectibleRecord | undefined> {
  try {
    const json = await request<{ success: boolean; error?: string; collectible?: CollectibleRecord }>({
      path: `/photos/${photoId}/collectibles`,
      method: 'POST',
      headers: getAuthHeaders(),
      body: data,
    })
    if (!json.success) throw new Error(json.error || 'Failed to create collectible')
    return json.collectible
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return undefined
    throw error
  }
}

export async function updateCollectible(
  collectibleId: CollectibleId,
  data: Partial<CollectibleRecord>,
): Promise<CollectibleRecord | undefined> {
  try {
    const json = await request<{ success: boolean; error?: string; collectible?: CollectibleRecord }>({
      path: `/collectibles/${collectibleId}`,
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: data,
    })
    if (!json.success) throw new Error(json.error || 'Failed to update collectible')
    return json.collectible
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return undefined
    throw error
  }
}

export async function upsertCollectible(
  photoId: PhotoId,
  data:
    | Partial<CollectibleRecord>
    | {
        formState: CollectibleFormState
      },
  options: { recordAi?: boolean } = {},
): Promise<CollectibleRecord | undefined> {
  try {
    const json = await request<{ success: boolean; error?: string; collectible?: CollectibleRecord }>({
      path: `/photos/${photoId}/collectibles`,
      method: 'PUT',
      headers: getAuthHeaders(),
      body: { ...data, ...options },
    })
    if (!json.success) throw new Error(json.error || 'Failed to upsert collectible')
    return json.collectible
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return undefined
    throw error
  }
}
