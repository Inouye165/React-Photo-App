export type OptimizationSizeLabel = 'large' | 'medium' | 'small'

export const OPTIMIZATION_SIZES: ReadonlyArray<{ label: OptimizationSizeLabel; maxDimension: number }> = [
  { label: 'large', maxDimension: 1920 },
  { label: 'medium', maxDimension: 1280 },
  { label: 'small', maxDimension: 640 },
]

export type OptimizedVariant = {
  label: OptimizationSizeLabel
  maxDimension: number
  width: number
  height: number
  blob: Blob
  sizeKB: number
}

export type ImageOptimizationResult = {
  original: {
    width: number
    height: number
    size: number
    type: string
  }
  variants: OptimizedVariant[]
  durationMs: number
}

export type ImageOptimizationOptions = {
  quality?: number
  sizes?: ReadonlyArray<{ label: OptimizationSizeLabel; maxDimension: number }>
}

const DEFAULT_QUALITY = 0.7
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|bmp|tiff|heic|heif)$/i
const SAFE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/heic',
  'image/heif',
])

function isSupportedImageFile(file: File): boolean {
  if (file.type?.startsWith('image/')) return true
  return IMAGE_EXTENSION_PATTERN.test(file.name)
}

function isLikelyBinaryImageHeader(arr: Uint8Array): boolean {
  if (arr && arr.length > 0 && arr[0] === 0x3c) return false
  if (arr && arr.length >= 2 && arr[0] === 0xff && arr[1] === 0xd8) return true
  if (arr.length >= 4 && arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4e && arr[3] === 0x47) return true
  if (arr.length >= 4 && arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x38) return true
  if (arr.length >= 2 && arr[0] === 0x42 && arr[1] === 0x4d) return true
  if (
    arr.length >= 12 &&
    arr[0] === 0x52 &&
    arr[1] === 0x49 &&
    arr[2] === 0x46 &&
    arr[3] === 0x46 &&
    arr[8] === 0x57 &&
    arr[9] === 0x45 &&
    arr[10] === 0x42 &&
    arr[11] === 0x50
  ) return true
  if (arr.length >= 12 && arr[4] === 0x66 && arr[5] === 0x74 && arr[6] === 0x79 && arr[7] === 0x70) return true
  return true
}

async function assertSafeImageFile(file: File): Promise<void> {
  const type = String(file.type || '').toLowerCase().trim()
  if (type && !SAFE_IMAGE_MIME_TYPES.has(type)) {
    throw new Error(`Unsupported image type: ${type.replace(/[<>]/g, '')}`)
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (!isLikelyBinaryImageHeader(header)) {
    throw new Error('Unsupported or unsafe image content')
  }
}

function calculateScaledDimensions(width: number, height: number, maxDimension: number) {
  const maxSide = Math.max(width, height)
  if (maxSide <= maxDimension) {
    return { width, height }
  }
  const scale = maxDimension / maxSide
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

async function loadSourceImage(file: File): Promise<{ image: HTMLImageElement | ImageBitmap; width: number; height: number }> {
  await assertSafeImageFile(file)

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return { image: bitmap, width: bitmap.width, height: bitmap.height }
    } catch (error) {
      console.warn('[image-optimization] createImageBitmap failed, falling back to Image element.', error)
    }
  }

  return new Promise((resolve, reject) => {
    const imageFactory = globalThis.Image as unknown as {
      new (): HTMLImageElement
      (): HTMLImageElement
    }
    let img: HTMLImageElement
    try {
      img = new imageFactory()
    } catch {
      try {
        img = imageFactory()
      } catch {
        img = document.createElement('img')
      }
    }
    const url = URL.createObjectURL(file)
    let revoked = false

    const revoke = () => {
      if (!revoked) {
        URL.revokeObjectURL(url)
        revoked = true
      }
    }

    img.onload = () => {
      revoke()
      resolve({
        image: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      })
    }

    img.onerror = () => {
      revoke()
      reject(new Error('Failed to decode image'))
    }

    img.src = url
  })
}

async function createWebpVariant(
  image: HTMLImageElement | ImageBitmap,
  width: number,
  height: number,
  quality: number,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false })
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, width, height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result)
        } else {
          reject(new Error('Failed to create WebP blob'))
        }
      },
      'image/webp',
      quality,
    )
  })

  canvas.width = 0
  canvas.height = 0

  return blob
}

export async function optimizeImageForMarkup(
  file: File,
  options: ImageOptimizationOptions = {},
): Promise<ImageOptimizationResult> {
  if (!file || !isSupportedImageFile(file)) {
    throw new Error('Unsupported file type')
  }

  const start = performance.now()
  const { image, width: originalWidth, height: originalHeight } = await loadSourceImage(file)
  const quality = typeof options.quality === 'number' ? options.quality : DEFAULT_QUALITY
  const sizes = options.sizes ?? OPTIMIZATION_SIZES

  const originalSizeKB = Number((file.size / 1024).toFixed(1))
  console.log(
    `[image-optimization] source ${originalWidth}x${originalHeight} ${originalSizeKB}KB`,
  )

  const variants: OptimizedVariant[] = []

  for (const size of sizes) {
    const { width, height } = calculateScaledDimensions(originalWidth, originalHeight, size.maxDimension)
    const blob = await createWebpVariant(image, width, height, quality)
    const sizeKB = Number((blob.size / 1024).toFixed(1))
    const elapsedMs = performance.now() - start

    console.log(
      `[image-optimization] ${size.label} ${width}x${height} ${sizeKB}KB in ${Math.round(elapsedMs)}ms`,
    )

    variants.push({
      label: size.label,
      maxDimension: size.maxDimension,
      width,
      height,
      blob,
      sizeKB,
    })
  }

  if ('close' in image && typeof image.close === 'function') {
    image.close()
  }

  return {
    original: {
      width: originalWidth,
      height: originalHeight,
      size: file.size,
      type: file.type,
    },
    variants,
    durationMs: performance.now() - start,
  }
}
