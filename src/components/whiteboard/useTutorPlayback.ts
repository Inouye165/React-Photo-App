import { useCallback, useEffect, useMemo, useState } from 'react'

type PlaybackStep = {
  id: string
}

type UseTutorPlaybackOptions = {
  steps: PlaybackStep[]
  reducedMotion: boolean
  intervalMs?: number
  initialStepId?: string | null
}

function resolveInitialStepId(steps: PlaybackStep[], initialStepId?: string | null): string | null {
  if (initialStepId && steps.some((step) => step.id === initialStepId)) {
    return initialStepId
  }

  return steps[0]?.id ?? null
}

export function useTutorPlayback({ steps, reducedMotion, intervalMs = 2600, initialStepId = null }: UseTutorPlaybackOptions) {
  const [activeStepId, setActiveStepId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const stepIdsKey = useMemo(() => steps.map((step) => step.id).join('|'), [steps])

  useEffect(() => {
    setActiveStepId((current) => {
      if (!current) return null
      if (steps.some((step) => step.id === current)) return current
      return resolveInitialStepId(steps, initialStepId)
    })
    setIsPlaying(false)
  }, [initialStepId, stepIdsKey, steps])

  const activeIndex = useMemo(() => steps.findIndex((step) => step.id === activeStepId), [activeStepId, steps])
  const resolvedActiveIndex = activeIndex >= 0 ? activeIndex : 0
  const isWalkthroughActive = activeStepId !== null

  const enterWalkthrough = useCallback((stepId?: string | null) => {
    if (steps.length === 0) return
    setActiveStepId(resolveInitialStepId(steps, stepId ?? initialStepId))
    setIsPlaying(false)
  }, [initialStepId, steps])

  const exitWalkthrough = useCallback(() => {
    setActiveStepId(null)
    setIsPlaying(false)
  }, [])

  const play = useCallback(() => {
    if (steps.length === 0) return
    setActiveStepId((current) => current ?? resolveInitialStepId(steps, initialStepId))
    setIsPlaying(true)
  }, [initialStepId, steps])

  const pause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const moveToIndex = useCallback((index: number) => {
    if (steps.length === 0) return
    const clamped = Math.min(Math.max(index, 0), steps.length - 1)
    setActiveStepId(steps[clamped]?.id ?? null)
    setIsPlaying(false)
  }, [steps])

  const next = useCallback(() => {
    if (steps.length === 0) return
    const baseIndex = activeIndex >= 0 ? activeIndex : resolvedActiveIndex
    const nextIndex = Math.min(baseIndex + 1, steps.length - 1)
    setActiveStepId(steps[nextIndex]?.id ?? null)
    setIsPlaying(false)
    if (nextIndex === steps.length - 1) {
      setIsPlaying(false)
    }
  }, [activeIndex, resolvedActiveIndex, steps])

  const previous = useCallback(() => {
    if (steps.length === 0) return
    const baseIndex = activeIndex >= 0 ? activeIndex : resolvedActiveIndex
    const previousIndex = Math.max(baseIndex - 1, 0)
    setActiveStepId(steps[previousIndex]?.id ?? null)
    setIsPlaying(false)
  }, [activeIndex, resolvedActiveIndex, steps])

  const replay = useCallback(() => {
    if (steps.length === 0) return
    setActiveStepId(resolveInitialStepId(steps, initialStepId))
    setIsPlaying(true)
  }, [initialStepId, steps])

  useEffect(() => {
    if (!isPlaying || steps.length <= 1) return undefined

    const timer = window.setTimeout(() => {
      if (resolvedActiveIndex >= steps.length - 1) {
        setIsPlaying(false)
        return
      }
      const nextIndex = resolvedActiveIndex + 1
      setActiveStepId(steps[nextIndex]?.id ?? null)
      if (nextIndex >= steps.length - 1) {
        setIsPlaying(false)
      }
    }, reducedMotion ? Math.max(1000, intervalMs - 800) : intervalMs)

    return () => window.clearTimeout(timer)
  }, [intervalMs, isPlaying, reducedMotion, resolvedActiveIndex, steps])

  return {
    activeStepId,
    activeStepIndex: resolvedActiveIndex,
    isWalkthroughActive,
    isPlaying,
    canPlay: steps.length > 1,
    setActiveStepId: (stepId: string | null) => {
      setActiveStepId(stepId)
      setIsPlaying(false)
    },
    enterWalkthrough,
    exitWalkthrough,
    moveToIndex,
    play,
    pause,
    next,
    previous,
    replay,
  }
}

export default useTutorPlayback