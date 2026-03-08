import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Edit3, Sparkles } from 'lucide-react'
import type { TutorStepStatus, WhiteboardTutorResponse } from '../../../types/whiteboard'
import { formatTutorRichText, parseTutorListItems } from '../whiteboardTutor'
import PanelScrollArea from './PanelScrollArea'

export type TutorLessonMessage = {
  title: string
  body: string
  tone: 'assistant' | 'canvas' | 'prompt'
}

export interface AITutorTabProps {
  className?: string
  hasPhoto: boolean
  hasBoardContent?: boolean
  hasInput?: boolean
  inputMode?: 'photo' | 'text'
  problemDraft?: string
  helpRequestDraft?: string
  onHelpRequestDraftChange?: (value: string) => void
  readyIntent?: 'analyze' | 'solve' | 'steps'
  onReadyIntentChange?: (value: 'analyze' | 'solve' | 'steps') => void
  onProblemDraftChange?: (value: string) => void
  analysis: WhiteboardTutorResponse | null
  isLoading: boolean
  error: string | null
  onStartAnalysis: () => void
  onRetryAnalysis: () => void
  responseAge: string
  responseAgeInvalid: boolean
  onResponseAgeChange: (value: string) => void
  followUpDraft: string
  isSubmitting: boolean
  onFollowUpDraftChange: (value: string) => void
  onSubmitFollowUp: () => void
  onLessonMessageChange?: (message: TutorLessonMessage | null) => void
}

type StepViewModel = {
  id: string
  title: string
  detail: string
  status?: TutorStepStatus | 'neutral'
}

function getQuestionText(analysis: WhiteboardTutorResponse | null): string {
  if (!analysis) return ''
  return (
    analysis.analysisResult?.problemText?.trim()
    || analysis.sections.problem?.trim()
    || analysis.problem?.trim()
    || ''
  )
}

function getSteps(analysis: WhiteboardTutorResponse | null): StepViewModel[] {
  if (!analysis) return []

  const structuredSteps = analysis.analysisResult?.steps ?? []
  if (structuredSteps.length > 0) {
    return structuredSteps.map((step, index) => ({
      id: step.id || `step-${index + 1}`,
      title: step.shortLabel?.trim() || `Step ${index + 1}`,
      detail: step.kidFriendlyExplanation?.trim() || step.correction?.trim() || step.hint?.trim() || step.studentText?.trim() || 'Review this step.',
      status: step.status,
    }))
  }

  if (analysis.steps.length > 0) {
    return analysis.steps.map((step, index) => ({
      id: `step-${step.number || index + 1}`,
      title: step.label?.trim() || `Step ${index + 1}`,
      detail: step.explanation?.trim() || step.studentWork?.trim() || 'Review this step.',
      status: step.correct ? 'correct' : 'neutral',
    }))
  }

  return parseTutorListItems(analysis.sections.stepsAnalysis).map((item, index) => ({
    id: `parsed-step-${index + 1}`,
    title: `Step ${index + 1}`,
    detail: item,
    status: 'neutral',
  }))
}

function getSolution(analysis: WhiteboardTutorResponse | null): string {
  if (!analysis) return ''
  const structured = analysis.analysisResult?.finalAnswers?.filter(Boolean).join(', ').trim()
  return structured || analysis.correctSolution?.trim() || ''
}

function getPrimaryInsight(analysis: WhiteboardTutorResponse | null): TutorLessonMessage | null {
  if (!analysis) return null

  const firstIncorrect = analysis.analysisResult?.steps?.find((step) => step.status === 'incorrect' || step.status === 'partial' || step.status === 'warning')
  if (firstIncorrect) {
    return {
      title: firstIncorrect.shortLabel?.trim() || 'Step to revisit',
      body: firstIncorrect.kidFriendlyExplanation?.trim() || firstIncorrect.correction?.trim() || firstIncorrect.hint?.trim() || 'Review this step carefully.',
      tone: 'assistant',
    }
  }

  const firstStep = getSteps(analysis)[0]
  if (firstStep) {
    return {
      title: firstStep.title,
      body: firstStep.detail,
      tone: 'canvas',
    }
  }

  return null
}

function statusClasses(status?: TutorStepStatus | 'neutral'): string {
  if (status === 'correct') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
  if (status === 'incorrect') return 'border-red-400/30 bg-red-500/10 text-red-200'
  if (status === 'partial') return 'border-amber-400/30 bg-amber-500/10 text-amber-200'
  if (status === 'warning') return 'border-sky-400/30 bg-sky-500/10 text-sky-200'
  return 'border-white/10 bg-white/[0.03] text-[#c6b4a4]'
}

function statusLabel(status?: TutorStepStatus | 'neutral'): string {
  if (!status || status === 'neutral') return 'Step'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function SectionTitle({ title }: { title: string }): React.JSX.Element {
  return <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">{title}</h3>
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }): React.JSX.Element {
  return <section className={`rounded-[10px] border border-white/10 bg-white/[0.03] p-4 ${className}`}>{children}</section>
}

function RichText({ value, className = '' }: { value: string; className?: string }): React.JSX.Element {
  return <div className={`text-[14px] leading-[1.6] text-[#F0EDE8] ${className}`} dangerouslySetInnerHTML={{ __html: formatTutorRichText(value) }} />
}

const AITutorTab: React.FC<AITutorTabProps> = ({
  className = '',
  hasPhoto,
  hasInput,
  inputMode = 'photo',
  problemDraft = '',
  analysis,
  isLoading,
  error,
  onStartAnalysis,
  onRetryAnalysis,
  responseAgeInvalid,
  onProblemDraftChange,
  onLessonMessageChange,
}) => {
  const parsedQuestion = useMemo(() => getQuestionText(analysis), [analysis])
  const [questionDraft, setQuestionDraft] = useState(problemDraft || parsedQuestion)
  const [editingQuestion, setEditingQuestion] = useState(false)
  const steps = useMemo(() => getSteps(analysis), [analysis])
  const solution = useMemo(() => getSolution(analysis), [analysis])
  const canRequestHelp = Boolean(hasPhoto || hasInput || questionDraft.trim()) && !responseAgeInvalid
  const helpButtonLabel = analysis ? 'Refresh AI help' : 'Get AI help'

  useEffect(() => {
    const next = problemDraft.trim() || parsedQuestion
    setQuestionDraft(next)
  }, [parsedQuestion, problemDraft])

  useEffect(() => {
    onLessonMessageChange?.(getPrimaryInsight(analysis))
  }, [analysis, onLessonMessageChange])

  const handleQuestionChange = (value: string) => {
    setQuestionDraft(value)
    onProblemDraftChange?.(value)
  }

  return (
    <div className={`flex h-full min-h-0 flex-col bg-[#1c1c1e] text-[#F0EDE8] ${className}`}>
      <PanelScrollArea className="flex-1" contentClassName="h-full px-4 py-4 pb-28">
        <div className="space-y-4 pb-4">
          <Card className="border-amber-400/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.12),rgba(255,255,255,0.03))]">
            <SectionTitle title="Tutor Assist" />
            <p className="mt-2 text-[14px] leading-[1.6] text-[#d8cfc4]">
              {analysis
                ? 'AI help is shown as the problem, the steps, and the solution.'
                : 'Request AI help when you want a clean read of the problem, the steps, and the solution.'}
            </p>
          </Card>

          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <SectionTitle title="Problem" />
                <p className="mt-1 text-[12px] leading-[1.45] text-[#8f867d]">
                  {analysis
                    ? 'This is the problem as the AI understands it.'
                    : inputMode === 'photo'
                      ? 'Usually this will be filled from the photo after AI help runs.'
                      : 'Type the problem here before requesting AI help.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingQuestion((current) => !current)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[#c6b4a4] transition hover:border-amber-400/40 hover:text-[#F0EDE8]"
                aria-label={editingQuestion ? 'Stop editing problem' : 'Edit problem'}
                title={editingQuestion ? 'Stop editing problem' : 'Edit problem'}
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            </div>

            {editingQuestion ? (
              <textarea
                aria-label="Problem or question"
                value={questionDraft}
                onChange={(event) => handleQuestionChange(event.target.value)}
                rows={3}
                className="mt-3 w-full resize-none rounded-[8px] border border-white/10 bg-black/15 px-3 py-2 text-[14px] text-[#F0EDE8] outline-none transition focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(201,130,43,0.16)] placeholder:text-[#c6b4a4]"
                placeholder="Example: Solve for x: 5x - 17 = 18"
              />
            ) : (
              <div className="mt-3 rounded-[8px] border border-white/10 bg-black/15 px-3 py-3 text-[16px] leading-[1.6] text-[#F0EDE8]">
                {questionDraft.trim() || 'No problem statement yet. Use AI help to read the photo, or edit this if needed.'}
              </div>
            )}
          </Card>

          {isLoading ? (
            <Card>
              <div className="flex items-center gap-3 text-[14px] text-[#F0EDE8]">
                <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-amber-300" />
                Generating the full steps and solution…
              </div>
            </Card>
          ) : null}

          {!isLoading && error ? (
            <Card className="border-red-500/30 bg-red-500/10">
              <SectionTitle title="AI help failed" />
              <p className="mt-2 text-[14px] leading-[1.6] text-red-100/90">{error}</p>
              <button
                type="button"
                onClick={onRetryAnalysis}
                className="mt-3 rounded-[8px] border border-white/10 bg-white/10 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-white/15"
              >
                Retry
              </button>
            </Card>
          ) : null}

          {analysis ? (
            <>
              <Card>
                <SectionTitle title="Steps" />
                <div className="mt-3 space-y-3">
                  {steps.length > 0 ? steps.map((step, index) => (
                    <article key={step.id} className="rounded-[10px] border border-white/10 bg-black/15 px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[14px] font-semibold text-[#F0EDE8]">{index + 1}. {step.title}</div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusClasses(step.status)}`}>
                          {statusLabel(step.status)}
                        </span>
                      </div>
                      <RichText value={step.detail} className="mt-2 text-[#d8cfc4]" />
                    </article>
                  )) : (
                    <div className="text-[14px] leading-[1.6] text-[#c6b4a4]">No steps available yet.</div>
                  )}
                </div>
              </Card>

              <Card className="border-emerald-400/20 bg-emerald-500/5">
                <SectionTitle title="Solution" />
                <div className="mt-3 flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
                  <div>
                    <div className="text-[18px] font-semibold text-[#F0EDE8]">{solution || 'No final answer available yet.'}</div>
                    {analysis.analysisResult?.overallSummary ? (
                      <RichText value={analysis.analysisResult.overallSummary} className="mt-2 text-[#d8cfc4]" />
                    ) : null}
                  </div>
                </div>
              </Card>

              {analysis.analysisResult?.steps?.some((step) => step.status === 'incorrect' || step.status === 'partial' || step.status === 'warning') ? (
                <Card className="border-amber-400/20 bg-amber-500/5">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-5 w-5 text-amber-300" />
                    <div className="text-[13px] leading-[1.6] text-[#d8cfc4]">
                      The step list above includes where the AI thinks the student may have gone off track.
                    </div>
                  </div>
                </Card>
              ) : null}
            </>
          ) : null}
        </div>
      </PanelScrollArea>

      <div className="sticky bottom-0 z-20 shrink-0 border-t border-white/10 bg-[#1c1c1e] p-4">
        <button
          type="button"
          onClick={onStartAnalysis}
          disabled={!canRequestHelp || isLoading}
          aria-label={helpButtonLabel}
          className="w-full rounded-[10px] bg-amber-500 px-4 py-3 text-[14px] font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
        >
          {helpButtonLabel}
        </button>
      </div>
    </div>
  )
}

export default AITutorTab
