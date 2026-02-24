import React from 'react'
import type { ChessTutorAnalysis } from '../../../api/chessTutor'
import AnalyzePanel from './AnalyzePanel'
import HistoryPanel from './HistoryPanel'
import LessonPanel from './LessonPanel'
import TutorTabs from './TutorTabs'
import type { TutorTab, ChessLesson, NotationGuideRow, NotationLineMove, TacticalPattern, ChessHistoryEvent, ChessStory, LessonSectionOption, LessonSection } from './types'

const classes = {
  root: 'rounded-2xl border border-slate-700 bg-slate-800/70 p-4',
  header: 'mb-3 flex items-start justify-between gap-3',
  title: 'text-lg font-semibold text-white',
  model: 'text-xs text-slate-300',
  cta: 'inline-flex min-h-9 items-center rounded-md border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
} as const

export default function TutorSidebar(props: {
  activeTab: TutorTab
  allowAnalyzeTab: boolean
  modelLabel: string
  onTabChange: (tab: TutorTab) => void
  onPractice: () => void
  analysis: ChessTutorAnalysis | null
  loading: boolean
  error: string | null
  onAnalyze: () => void
  historyEvents: ChessHistoryEvent[]
  activeLessonSection: LessonSection
  setActiveLessonSection: (value: LessonSection) => void
  lessonSections: LessonSectionOption[]
  stories: ChessStory[]
  activeStoryId: string
  setActiveStoryId: (value: string) => void
  onOpenStory: () => void
  showStoryHint: boolean
  onDismissStoryHint: () => void
  activeLesson: ChessLesson
  activeLessonIndex: number
  setActiveLessonIndex: (value: number) => void
  lessons: ChessLesson[]
  notationAutoplay: boolean
  setNotationAutoplay: (value: boolean | ((prev: boolean) => boolean)) => void
  notationFocus: 'rank' | 'file' | 'move'
  setNotationFocus: (value: 'rank' | 'file' | 'move') => void
  notationPly: number
  setNotationPly: (value: number | ((prev: number) => number)) => void
  notationMoves: NotationLineMove[]
  notationGuideRows: NotationGuideRow[]
  patternAutoplay: boolean
  setPatternAutoplay: (value: boolean | ((prev: boolean) => boolean)) => void
  patterns: TacticalPattern[]
  activePatternIndex: number
  setActivePatternIndex: (value: number) => void
  patternFrame: number
  setPatternFrame: (value: number) => void
  activePattern: TacticalPattern
  discoveredCheckAutoplay: boolean
  setDiscoveredCheckAutoplay: (value: boolean | ((prev: boolean) => boolean)) => void
  discoveredCheckFrame: number
  setDiscoveredCheckFrame: (value: number) => void
  discoveredCheckPattern: TacticalPattern
}): React.JSX.Element {
  return (
    <aside data-testid="tutor-sidebar" className={classes.root}>
      <div className={classes.header}>
        <div>
          <h2 className={classes.title}>Chess Tutor</h2>
          <div className={classes.model}>{props.modelLabel}</div>
        </div>
        <button type="button" onClick={props.onPractice} className={classes.cta}>Practice this</button>
      </div>

      <div className="mb-3">
        <TutorTabs activeTab={props.activeTab} allowAnalyzeTab={props.allowAnalyzeTab} onChange={props.onTabChange} />
      </div>

      {props.activeTab === 'analyze' && props.allowAnalyzeTab ? (
        <AnalyzePanel loading={props.loading} error={props.error} analysis={props.analysis} onAnalyze={props.onAnalyze} />
      ) : props.activeTab === 'history' ? (
        <HistoryPanel events={props.historyEvents} />
      ) : (
        <LessonPanel
          activeLessonSection={props.activeLessonSection}
          setActiveLessonSection={props.setActiveLessonSection}
          lessonSections={props.lessonSections}
          stories={props.stories}
          activeStoryId={props.activeStoryId}
          setActiveStoryId={props.setActiveStoryId}
          onOpenStory={props.onOpenStory}
          showStoryHint={props.showStoryHint}
          onDismissStoryHint={props.onDismissStoryHint}
          activeLesson={props.activeLesson}
          activeLessonIndex={props.activeLessonIndex}
          setActiveLessonIndex={props.setActiveLessonIndex}
          lessons={props.lessons}
          notationAutoplay={props.notationAutoplay}
          setNotationAutoplay={props.setNotationAutoplay}
          notationFocus={props.notationFocus}
          setNotationFocus={props.setNotationFocus}
          notationPly={props.notationPly}
          setNotationPly={props.setNotationPly}
          notationMoves={props.notationMoves}
          notationGuideRows={props.notationGuideRows}
          patternAutoplay={props.patternAutoplay}
          setPatternAutoplay={props.setPatternAutoplay}
          patterns={props.patterns}
          activePatternIndex={props.activePatternIndex}
          setActivePatternIndex={props.setActivePatternIndex}
          patternFrame={props.patternFrame}
          setPatternFrame={props.setPatternFrame}
          activePattern={props.activePattern}
          discoveredCheckAutoplay={props.discoveredCheckAutoplay}
          setDiscoveredCheckAutoplay={props.setDiscoveredCheckAutoplay}
          discoveredCheckFrame={props.discoveredCheckFrame}
          setDiscoveredCheckFrame={props.setDiscoveredCheckFrame}
          discoveredCheckPattern={props.discoveredCheckPattern}
        />
      )}
    </aside>
  )
}
