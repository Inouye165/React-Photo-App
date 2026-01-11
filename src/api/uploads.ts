import { request, ApiError, API_BASE_URL } from './httpClient'
import { getAuthHeaders } from './auth'

export interface UploadPhotoOptions {
  classification?: string
  collectibleId?: string
}

function inferMimeTypeFromFilename(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (!ext) return undefined

  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'heic':
      return 'image/heic'
    case 'heif':
      return 'image/heif'
    default:
      return undefined
  }
}

function withInferredFileType(file: File): File {
  if (file.type) return file

  const inferredMimeType = inferMimeTypeFromFilename(file.name)
  if (!inferredMimeType) return file

  return new File([file], file.name, {
    type: inferredMimeType,
    lastModified: file.lastModified,
  })
}

export async function uploadPhotoToServer(
  file: File,
  serverUrl: string | UploadPhotoOptions = `${API_BASE_URL}/upload`,
  thumbnailBlob: Blob | null = null,
  options: UploadPhotoOptions = {},
): Promise<unknown> {
  let effectiveServerUrl: string | UploadPhotoOptions = serverUrl
  let effectiveOptions: UploadPhotoOptions = options
  let effectiveThumbnailBlob: Blob | null = thumbnailBlob

  if (serverUrl && typeof serverUrl === 'object' && !(serverUrl instanceof String)) {
    effectiveOptions = serverUrl as UploadPhotoOptions
    effectiveServerUrl = `${API_BASE_URL}/upload`
    effectiveThumbnailBlob = thumbnailBlob
  }

  const effectiveFile = withInferredFileType(file)

  const form = new FormData()

  // IMPORTANT (busboy/streaming): append non-file fields first so they are available
  // when the file stream is processed server-side.
  const collectibleId = (effectiveOptions as UploadPhotoOptions | undefined)?.collectibleId
  if (typeof collectibleId === 'string' && collectibleId.trim()) {
    form.append('collectibleId', collectibleId.trim())
  }

  const classification = effectiveOptions?.classification
  if (typeof classification === 'string' && classification.trim()) {
    form.append('classification', classification.trim())
  }

  form.append('photo', effectiveFile, effectiveFile.name)
  if (effectiveThumbnailBlob) {
    form.append('thumbnail', effectiveThumbnailBlob, 'thumbnail.jpg')
  }

  try {
    return await request({
      path: effectiveServerUrl as string,
      method: 'POST',
      headers: getAuthHeaders(),
      body: form,
    })
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return undefined
    if (error instanceof ApiError) {
        throw new Error('Upload failed')
    }
    throw error
  }
}
