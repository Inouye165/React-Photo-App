export type MathFactDomain = 'arithmetic' | 'algebra' | 'unknown'

export type MathFactConfidence = 'high' | 'medium' | 'low'

export type MathFactErrorType =
  | 'arithmetic-slip'
  | 'equation-transform'
  | 'final-answer-mismatch'
  | 'unsupported'
  | 'unverified'

export type VerifiedMathStep = {
  stepIndex: number
  expression?: string
  isValid: boolean
  explanation?: string
  errorType?: MathFactErrorType
}

export type DetectedMathError = {
  stepIndex?: number
  errorType?: MathFactErrorType
  explanation?: string
}

export type DeterministicMathFacts = {
  supported: boolean
  domain: MathFactDomain
  canonicalProblem: string | null
  verifiedAnswer: string[] | null
  verifiedSteps: VerifiedMathStep[]
  detectedError: DetectedMathError | null
  confidence: MathFactConfidence
  unsupportedReason?: string
}

export type SolvedMathProblem = {
  supported: boolean
  domain: MathFactDomain
  canonicalProblem: string | null
  verifiedAnswer: string[] | null
  confidence: MathFactConfidence
  unsupportedReason?: string
}
