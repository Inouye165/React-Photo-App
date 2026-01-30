export const BOARD_ASPECT = 4 / 3

export type ContainedRect = {
  left: number
  top: number
  width: number
  height: number
}

export function computeContainedRect(
  wrapperWidth: number,
  wrapperHeight: number,
  aspect: number,
): ContainedRect {
  if (!Number.isFinite(wrapperWidth) || !Number.isFinite(wrapperHeight) || wrapperWidth <= 0 || wrapperHeight <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 }
  }

  const wrapperAspect = wrapperWidth / wrapperHeight
  if (wrapperAspect > aspect) {
    const height = wrapperHeight
    const width = height * aspect
    return {
      left: (wrapperWidth - width) / 2,
      top: 0,
      width,
      height,
    }
  }

  const width = wrapperWidth
  const height = width / aspect
  return {
    left: 0,
    top: (wrapperHeight - height) / 2,
    width,
    height,
  }
}
