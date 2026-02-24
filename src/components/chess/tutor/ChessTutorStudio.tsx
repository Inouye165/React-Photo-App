import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChessTutorAnalysis } from '../../../api/chessTutor'
import TutorBoard from './TutorBoard'
import TutorSidebar from './TutorSidebar'
import type {
  TutorTab,
  LessonSection,
  ChessLesson,
  NotationGuideRow,
  NotationLineMove,
  TacticalPattern,
  ChessHistoryEvent,
  ChessStory,
  LessonSectionOption,
  LessonSquareStylesBuilder,
  TutorBoardRenderState,
} from './types'

const TUTOR_STORY_HINT_SEEN_KEY = 'chess:tutorial-story-hint-seen:v1'

const classes = {
  root: 'grid min-h-0 flex-1 grid-cols-1 gap-2 lg:gap-4 lg:grid-cols-[minmax(0,1fr)_380px]',
} as const

export default function ChessTutorStudio({
  analysis,
  modelLabel,
  loading,
  error,
  onAnalyze,
  initialTab,
  openStoryOnLoad,
  initialStoryId,
  allowAnalyzeTab = true,
  stories,
  lessons,
  lessonSections,
  historyEvents,
  notationMoves,
  notationFrames,
  notationGuideRows,
  rankReference,
  fileReference,
  rankDemoSquares,
  fileDemoSquares,
  attackPatterns,
  discoveredCheckPattern,
  lessonSquareStyles,
  customPieces,
  storyModalComponent: StoryModalComponent,
  onPractice,
}: {
  analysis: ChessTutorAnalysis | null
  modelLabel: string
  loading: boolean
  error: string | null
  onAnalyze: () => void
  initialTab?: TutorTab
  openStoryOnLoad?: boolean
  initialStoryId?: string
  allowAnalyzeTab?: boolean
  stories: ChessStory[]
  lessons: ChessLesson[]
  lessonSections: LessonSectionOption[]
  historyEvents: ChessHistoryEvent[]
  notationMoves: NotationLineMove[]
  notationFrames: string[]
  notationGuideRows: NotationGuideRow[]
  rankReference: string[]
  fileReference: string[]
  rankDemoSquares: string[]
  fileDemoSquares: string[]
  attackPatterns: TacticalPattern[]
  discoveredCheckPattern: TacticalPattern
  lessonSquareStyles: LessonSquareStylesBuilder
  customPieces: Record<string, (props: { squareWidth: number; isDragging: boolean }) => React.JSX.Element>
  storyModalComponent: React.ComponentType<{ open: boolean; onClose: () => void; pdfUrl: string; storyTitle: string; storyAudioSlug: string }>
  onPractice: () => void
}): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TutorTab>(() => {
    const defaultTab: TutorTab = allowAnalyzeTab ? 'lesson' : 'history'
    const requested = initialTab ?? defaultTab
    if (!allowAnalyzeTab && requested === 'analyze') return 'history'
    return requested
  })
  const [activeLessonIndex, setActiveLessonIndex] = useState(0)
  const [animationFrame, setAnimationFrame] = useState(0)
  const [activeLessonSection, setActiveLessonSection] = useState<LessonSection>('pieces')
  const [notationPly, setNotationPly] = useState(0)
  const [notationAutoplay, setNotationAutoplay] = useState(true)
  const [notationFocus, setNotationFocus] = useState<'rank' | 'file' | 'move'>('rank')
  const [activePatternIndex, setActivePatternIndex] = useState(0)
  const [patternFrame, setPatternFrame] = useState(0)
  const [patternAutoplay, setPatternAutoplay] = useState(true)
  const [discoveredCheckFrame, setDiscoveredCheckFrame] = useState(0)
  const [discoveredCheckAutoplay, setDiscoveredCheckAutoplay] = useState(true)
  const [storyModalOpen, setStoryModalOpen] = useState(false)
  const [showStoryHint, setShowStoryHint] = useState(false)
  const [boardWidth, setBoardWidth] = useState(540)
  const [activeStoryId, setActiveStoryId] = useState<string>(() => {
    const found = stories.some((story) => story.id === initialStoryId)
    return found && initialStoryId ? initialStoryId : stories[0]?.id || ''
  })
  const boardStageRef = useRef<HTMLDivElement | null>(null)

  const activeLesson = lessons[activeLessonIndex]
  const activeStory = stories.find((story) => story.id === activeStoryId) ?? stories[0]
  const activePattern = attackPatterns[activePatternIndex]
  const activeNotationMove = notationPly > 0 ? notationMoves[notationPly - 1] : null
  const notationFrame = notationFrames[Math.min(notationPly, notationFrames.length - 1)]
  const patternCurrentHighlights = activePattern.frameHighlights?.[patternFrame] ?? activePattern.highlightSquares
  const patternCurrentArrows = activePattern.frameArrows?.[patternFrame] ?? []
  const discoveredCheckCurrentArrows = discoveredCheckPattern.frameArrows?.[discoveredCheckFrame] ?? []

  useEffect(() => {
    const measure = () => {
      const width = boardStageRef.current?.clientWidth ?? 0
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0
      const widthBasedLimit = Math.floor(width || 540)

      const isCompactViewport = viewportWidth > 0 && viewportWidth < 960
      const mobileHeightCap = viewportHeight > 0
        ? Math.max(300, Math.floor(viewportHeight * 0.43))
        : 460

      const compactCap = isCompactViewport
        ? Math.min(520, mobileHeightCap)
        : 620

      const next = Math.max(300, Math.min(compactCap, widthBasedLimit))
      setBoardWidth((current) => (current === next ? current : next))
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    if (!allowAnalyzeTab && activeTab === 'analyze') setActiveTab('history')
  }, [activeTab, allowAnalyzeTab])

  useEffect(() => {
    if (!initialTab) return
    if (!allowAnalyzeTab && initialTab === 'analyze') {
      setActiveTab('history')
      return
    }
    setActiveTab(initialTab)
  }, [allowAnalyzeTab, initialTab])

  useEffect(() => {
    if (!initialStoryId) return
    if (!stories.some((story) => story.id === initialStoryId)) return
    setActiveStoryId(initialStoryId)
  }, [initialStoryId, stories])

  useEffect(() => {
    if (!openStoryOnLoad) return
    setActiveTab('lesson')
    setStoryModalOpen(true)
  }, [openStoryOnLoad])

  useEffect(() => {
    if (activeTab !== 'lesson') {
      setShowStoryHint(false)
      return
    }
    try {
      setShowStoryHint(localStorage.getItem(TUTOR_STORY_HINT_SEEN_KEY) !== '1')
    } catch {
      setShowStoryHint(true)
    }
  }, [activeTab])

  const dismissStoryHint = useCallback(() => {
    setShowStoryHint(false)
    try {
      localStorage.setItem(TUTOR_STORY_HINT_SEEN_KEY, '1')
    } catch {
    }
  }, [])

  useEffect(() => {
    setAnimationFrame(0)
  }, [activeLessonIndex])

  useEffect(() => {
    setPatternFrame(0)
  }, [activePatternIndex])

  useEffect(() => {
    setDiscoveredCheckFrame(0)
  }, [activeLessonSection])

  useEffect(() => {
    if (activeTab !== 'lesson') return
    const timer = window.setInterval(() => {
      setAnimationFrame((prev) => (prev + 1) % activeLesson.frames.length)
    }, 1200)
    return () => window.clearInterval(timer)
  }, [activeTab, activeLesson.frames.length])

  useEffect(() => {
    if (activeTab !== 'lesson' || !notationAutoplay) return
    if (activeLessonSection !== 'board-notation') return
    const timer = window.setInterval(() => {
      setNotationFocus((currentFocus) => {
        if (currentFocus === 'rank') return 'file'
        if (currentFocus === 'file') {
          setNotationPly(1)
          return 'move'
        }

        let completed = false
        setNotationPly((currentPly) => {
          if (currentPly >= notationMoves.length) {
            completed = true
            return 0
          }
          return currentPly + 1
        })
        return completed ? 'rank' : 'move'
      })
    }, 1700)
    return () => window.clearInterval(timer)
  }, [activeTab, notationAutoplay, activeLessonSection, notationMoves.length])

  useEffect(() => {
    if (activeTab !== 'lesson' || activeLessonSection !== 'attacks' || !patternAutoplay) return
    const timer = window.setInterval(() => {
      setPatternFrame((prev) => (prev + 1) % activePattern.frames.length)
    }, 1600)
    return () => window.clearInterval(timer)
  }, [activeTab, activeLessonSection, patternAutoplay, activePattern.frames.length])

  useEffect(() => {
    if (activeTab !== 'lesson' || activeLessonSection !== 'discovered-check' || !discoveredCheckAutoplay) return
    const timer = window.setInterval(() => {
      setDiscoveredCheckFrame((prev) => (prev + 1) % discoveredCheckPattern.frames.length)
    }, 1700)
    return () => window.clearInterval(timer)
  }, [activeTab, activeLessonSection, discoveredCheckAutoplay, discoveredCheckPattern.frames.length])

  const notationBoardHighlights = useMemo(() => {
    if (notationFocus === 'rank') return rankDemoSquares
    if (notationFocus === 'file') return fileDemoSquares
    return activeNotationMove?.focusSquares ?? []
  }, [notationFocus, rankDemoSquares, fileDemoSquares, activeNotationMove])

  const boardState: TutorBoardRenderState = useMemo(() => {
    const position = activeLessonSection === 'pieces'
      ? activeLesson.frames[animationFrame]
      : activeLessonSection === 'board-notation'
        ? notationFrame
        : activeLessonSection === 'attacks'
          ? activePattern.frames[patternFrame]
          : discoveredCheckPattern.frames[discoveredCheckFrame]

    const customArrows = activeLessonSection === 'attacks'
      ? patternCurrentArrows
      : activeLessonSection === 'discovered-check'
        ? discoveredCheckCurrentArrows
        : []

    const customSquareStyles = activeLessonSection === 'pieces'
      ? lessonSquareStyles(activeLesson.highlightSquares)
      : activeLessonSection === 'board-notation'
        ? lessonSquareStyles(notationBoardHighlights)
        : activeLessonSection === 'attacks'
          ? lessonSquareStyles(patternCurrentHighlights)
          : lessonSquareStyles(discoveredCheckPattern.highlightSquares)

    const targetSquare = (notationFocus === 'move' && activeNotationMove ? activeNotationMove.to : 'e2')
    const targetFile = targetSquare[0] || 'e'
    const targetRank = targetSquare[1] || '2'
    const targetFileIndex = fileReference.indexOf(targetFile)
    const targetRankNumber = Number(targetRank)
    const targetX = targetFileIndex >= 0 ? (targetFileIndex + 0.5) * 31.25 : 125
    const targetY = targetRankNumber > 0 ? (8 - targetRankNumber + 0.5) * 31.25 : 125

    return {
      position,
      customArrows,
      customSquareStyles,
      notationOverlay: {
        show: activeLessonSection === 'board-notation',
        targetX,
        targetY,
        targetFile,
        targetRank,
        moveLabel: activeLessonSection === 'board-notation' && notationFocus === 'move' && activeNotationMove
          ? `${activeNotationMove.from} → ${activeNotationMove.to}`
          : null,
        files: fileReference,
        ranks: rankReference,
      },
    }
  }, [
    activeLessonSection,
    activeLesson.frames,
    animationFrame,
    notationFrame,
    activePattern.frames,
    patternFrame,
    discoveredCheckPattern.frames,
    discoveredCheckFrame,
    patternCurrentArrows,
    discoveredCheckCurrentArrows,
    lessonSquareStyles,
    activeLesson.highlightSquares,
    notationBoardHighlights,
    patternCurrentHighlights,
    discoveredCheckPattern.highlightSquares,
    notationFocus,
    activeNotationMove,
    fileReference,
    rankReference,
  ])

  const handleOpenStory = () => {
    dismissStoryHint()
    setStoryModalOpen(true)
  }

  return (
    <div data-testid="tutor-studio" className={classes.root}>
      <div ref={boardStageRef} className="min-h-0">
        <TutorBoard boardState={boardState} boardWidth={boardWidth} customPieces={customPieces} />
      </div>

      <TutorSidebar
        activeTab={activeTab}
        allowAnalyzeTab={allowAnalyzeTab}
        modelLabel={modelLabel}
        onTabChange={setActiveTab}
        onPractice={onPractice}
        analysis={analysis}
        loading={loading}
        error={error}
        onAnalyze={onAnalyze}
        historyEvents={historyEvents}
        activeLessonSection={activeLessonSection}
        setActiveLessonSection={setActiveLessonSection}
        lessonSections={lessonSections}
        stories={stories}
        activeStoryId={activeStoryId}
        setActiveStoryId={setActiveStoryId}
        onOpenStory={handleOpenStory}
        showStoryHint={showStoryHint}
        onDismissStoryHint={dismissStoryHint}
        activeLesson={activeLesson}
        activeLessonIndex={activeLessonIndex}
        setActiveLessonIndex={setActiveLessonIndex}
        lessons={lessons}
        notationAutoplay={notationAutoplay}
        setNotationAutoplay={setNotationAutoplay}
        notationFocus={notationFocus}
        setNotationFocus={setNotationFocus}
        notationPly={notationPly}
        setNotationPly={setNotationPly}
        notationMoves={notationMoves}
        notationGuideRows={notationGuideRows}
        patternAutoplay={patternAutoplay}
        setPatternAutoplay={setPatternAutoplay}
        patterns={attackPatterns}
        activePatternIndex={activePatternIndex}
        setActivePatternIndex={setActivePatternIndex}
        patternFrame={patternFrame}
        setPatternFrame={setPatternFrame}
        activePattern={activePattern}
        discoveredCheckAutoplay={discoveredCheckAutoplay}
        setDiscoveredCheckAutoplay={setDiscoveredCheckAutoplay}
        discoveredCheckFrame={discoveredCheckFrame}
        setDiscoveredCheckFrame={setDiscoveredCheckFrame}
        discoveredCheckPattern={discoveredCheckPattern}
      />

      {activeStory ? (
        <StoryModalComponent
          open={storyModalOpen}
          onClose={() => setStoryModalOpen(false)}
          pdfUrl={activeStory.pdfUrl}
          storyTitle={activeStory.title}
          storyAudioSlug={activeStory.audioSlug}
        />
      ) : null}
    </div>
  )
}
