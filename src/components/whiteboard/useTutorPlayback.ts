import { useCallback, useEffect, useMemo, useState } from 'react'

type PlaybackStep = {
  id: string
}

type UseTutorPlaybackOptions = {
  steps: PlaybackStep[]
  reducedMotion: boolean
  intervalMs?: number
}

export function useTutorPlayback({ steps, reducedMotion, intervalMs = 2600 }: UseTutorPlaybackOptions) {
  const [activeStepId, setActiveStepId] = useState<string | null>(steps[0]?.id ?? null)
  const [isPlaying, setIsPlaying] = useState(false)

  const stepIdsKey = useMemo(() => steps.map((step) => step.id).join('|'), [steps])

  useEffect(() => {
    setActiveStepId(steps[0]?.id ?? null)
    setIsPlaying(false)
  }, [stepIdsKey, steps])

  const activeIndex = useMemo(() => steps.findIndex((step) => step.id === activeStepId), [activeStepId, steps])
  const resolvedActiveIndex = activeIndex >= 0 ? activeIndex : 0

  const play = useCallback(() => {
    if (steps.length === 0) return
    setIsPlaying(true)
  }, [steps.length])

  const pause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const moveToIndex = useCallback((index: number) => {
    if (steps.length === 0) return
    const clamped = Math.min(Math.max(index, 0), steps.length - 1)
    setActiveStepId(steps[clamped]?.id ?? null)
  }, [steps])

  const next = useCallback(() => {
    if (steps.length === 0) return
    const nextIndex = Math.min(resolvedActiveIndex + 1, steps.length - 1)
    setActiveStepId(steps[nextIndex]?.id ?? null)
    if (nextIndex === steps.length - 1) {
      setIsPlaying(false)
    }
  }, [resolvedActiveIndex, steps])

  const previous = useCallback(() => {
    if (steps.length === 0) return
    const previousIndex = Math.max(resolvedActiveIndex - 1, 0)
    setActiveStepId(steps[previousIndex]?.id ?? null)
  }, [resolvedActiveIndex, steps])

  const replay = useCallback(() => {
    if (steps.length === 0) return
    setActiveStepId(steps[0]?.id ?? null)
    setIsPlaying(true)
  }, [steps])

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
    isPlaying,
    canPlay: steps.length > 1,
    setActiveStepId: (stepId: string) => {
      setActiveStepId(stepId)
      setIsPlaying(false)
    },
    moveToIndex,
    play,
    pause,
    next,
    previous,
    replay,
  }
}

export default useTutorPlayback