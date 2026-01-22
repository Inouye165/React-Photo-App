import type { Area } from 'react-easy-crop'

export const AVATAR_OUTPUT_SIZE = 512

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = (error) => reject(error)
    image.src = url
  })
}

export async function createAvatarBlob(
  imageSrc: string,
  crop: Area,
  outputSize = AVATAR_OUTPUT_SIZE,
  quality = 0.9,
): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  canvas.width = outputSize
  canvas.height = outputSize

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outputSize,
    outputSize,
  )

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result)
        } else {
          reject(new Error('Failed to create avatar blob'))
        }
      },
      'image/jpeg',
      quality,
    )
  })

  canvas.width = 0
  canvas.height = 0

  return blob
}
