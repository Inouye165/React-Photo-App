export type TutorStepStatus = 'correct' | 'incorrect' | 'partial' | 'warning'

export type TutorDetectedRegion = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type TutorStepAnalysis = {
  id: string
  index: number
  studentText: string
  normalizedMath?: string
  status: TutorStepStatus
  shortLabel: string
  kidFriendlyExplanation: string
  correction?: string
  hint?: string
  regionId?: string
}

export type TutorAnalysisResult = {
  problemText: string
  finalAnswers: string[]
  overallSummary: string
  regions: TutorDetectedRegion[]
  steps: TutorStepAnalysis[]
  validatorWarnings: string[]
  canAnimate: boolean
}

type Token =
  | { type: 'number'; value: number }
  | { type: 'variable' }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' | '^' }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'function'; value: 'sqrt' }

type AstNode =
  | { type: 'number'; value: number }
  | { type: 'variable' }
  | { type: 'unary'; operator: '+' | '-'; argument: AstNode }
  | { type: 'binary'; operator: '+' | '-' | '*' | '/' | '^'; left: AstNode; right: AstNode }
  | { type: 'function'; name: 'sqrt'; argument: AstNode }

type ValidationFinding = {
  status: TutorStepStatus
  warning?: string
  correction?: string
  hint?: string
}

type FinalAnswerValidation = {
  status: TutorStepStatus
  warnings: string[]
  expectedAnswers: number[]
  matchedAnswers: number[]
}

function normalizeMathText(value: string): string {
  return value
    .replace(/[−–—]/g, '-')
    .replace(/[×xX](?=\d)/g, '*')
    .replace(/÷/g, '/')
    .replace(/\u221a/g, 'sqrt')
    .replace(/\s+/g, '')
    .replace(/(\d)([a-zA-Z(])/g, '$1*$2')
    .replace(/([)x])(\d)/g, '$1*$2')
    .replace(/([)])([a-zA-Z(])/g, '$1*$2')
}

function tokenizeExpression(source: string): Token[] | null {
  const tokens: Token[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]
    if (/\d|\./.test(char)) {
      let end = index + 1
      while (end < source.length && /\d|\./.test(source[end])) {
        end += 1
      }
      const value = Number(source.slice(index, end))
      if (!Number.isFinite(value)) return null
      tokens.push({ type: 'number', value })
      index = end
      continue
    }

    if (char === 'x' || char === 'X') {
      tokens.push({ type: 'variable' })
      index += 1
      continue
    }

    if (source.slice(index, index + 4).toLowerCase() === 'sqrt') {
      tokens.push({ type: 'function', value: 'sqrt' })
      index += 4
      continue
    }

    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char })
      index += 1
      continue
    }

    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '^') {
      tokens.push({ type: 'operator', value: char })
      index += 1
      continue
    }

    return null
  }

  return tokens
}

function parseExpressionAst(source: string): AstNode | null {
  const tokens = tokenizeExpression(source)
  if (!tokens) return null
  let index = 0

  function parsePrimary(): AstNode | null {
    const token = tokens[index]
    if (!token) return null

    if (token.type === 'number') {
      index += 1
      return { type: 'number', value: token.value }
    }

    if (token.type === 'variable') {
      index += 1
      return { type: 'variable' }
    }

    if (token.type === 'function' && token.value === 'sqrt') {
      index += 1
      const next = parsePrimary()
      if (!next) return null
      return { type: 'function', name: 'sqrt', argument: next }
    }

    if (token.type === 'paren' && token.value === '(') {
      index += 1
      const expression = parseAdditive()
      if (!expression) return null
      const closer = tokens[index]
      if (!closer || closer.type !== 'paren' || closer.value !== ')') return null
      index += 1
      return expression
    }

    if (token.type === 'operator' && (token.value === '+' || token.value === '-')) {
      index += 1
      const argument = parsePrimary()
      if (!argument) return null
      return { type: 'unary', operator: token.value, argument }
    }

    return null
  }

  function parsePower(): AstNode | null {
    let node = parsePrimary()
    if (!node) return null

    while (true) {
      const operatorToken = tokens[index]
      if (!operatorToken || operatorToken.type !== 'operator' || operatorToken.value !== '^') break
      index += 1
      const right = parsePrimary()
      if (!right) return null
      node = { type: 'binary', operator: '^', left: node, right }
    }

    return node
  }

  function parseMultiplicative(): AstNode | null {
    let node = parsePower()
    if (!node) return null

    while (true) {
      const operatorToken = tokens[index]
      if (!operatorToken || operatorToken.type !== 'operator' || (operatorToken.value !== '*' && operatorToken.value !== '/')) break
      const operator = operatorToken.value
      index += 1
      const right = parsePower()
      if (!right) return null
      node = { type: 'binary', operator, left: node, right }
    }

    return node
  }

  function parseAdditive(): AstNode | null {
    let node = parseMultiplicative()
    if (!node) return null

    while (true) {
      const operatorToken = tokens[index]
      if (!operatorToken || operatorToken.type !== 'operator' || (operatorToken.value !== '+' && operatorToken.value !== '-')) break
      const operator = operatorToken.value
      index += 1
      const right = parseMultiplicative()
      if (!right) return null
      node = { type: 'binary', operator, left: node, right }
    }

    return node
  }

  const expression = parseAdditive()
  if (!expression || index !== tokens.length) return null
  return expression
}

function evaluateAst(node: AstNode, xValue: number): number {
  switch (node.type) {
    case 'number':
      return node.value
    case 'variable':
      return xValue
    case 'unary': {
      const value = evaluateAst(node.argument, xValue)
      return node.operator === '-' ? -value : value
    }
    case 'function':
      return Math.sqrt(evaluateAst(node.argument, xValue))
    case 'binary': {
      const left = evaluateAst(node.left, xValue)
      const right = evaluateAst(node.right, xValue)
      switch (node.operator) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          return right === 0 ? Number.NaN : left / right
        case '^':
          return left ** right
      }
    }
  }
}

type Polynomial = [number, number, number]

function addPoly(a: Polynomial, b: Polynomial): Polynomial {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function subtractPoly(a: Polynomial, b: Polynomial): Polynomial {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function multiplyPoly(a: Polynomial, b: Polynomial): Polynomial | null {
  const out = [0, 0, 0] as Polynomial
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      const degree = i + j
      if (degree > 2) return null
      out[degree] += a[i] * b[j]
    }
  }
  return out
}

function astToPolynomial(node: AstNode): Polynomial | null {
  switch (node.type) {
    case 'number':
      return [node.value, 0, 0]
    case 'variable':
      return [0, 1, 0]
    case 'unary': {
      const polynomial = astToPolynomial(node.argument)
      if (!polynomial) return null
      return node.operator === '-' ? ([-polynomial[0], -polynomial[1], -polynomial[2]] as Polynomial) : polynomial
    }
    case 'function':
      return null
    case 'binary': {
      const left = astToPolynomial(node.left)
      const right = astToPolynomial(node.right)
      switch (node.operator) {
        case '+':
          return left && right ? addPoly(left, right) : null
        case '-':
          return left && right ? subtractPoly(left, right) : null
        case '*':
          return left && right ? multiplyPoly(left, right) : null
        case '/':
          if (!left || !right || right[1] !== 0 || right[2] !== 0 || right[0] === 0) return null
          return [left[0] / right[0], left[1] / right[0], left[2] / right[0]]
        case '^':
          if (!left || !right || right[1] !== 0 || right[2] !== 0) return null
          if (right[0] === 2) return multiplyPoly(left, left)
          if (right[0] === 1) return left
          if (right[0] === 0) return [1, 0, 0]
          return null
      }
    }
  }
}

function parseEquation(text: string): { normalized: string; left: AstNode; right: AstNode } | null {
  const normalized = normalizeMathText(text)
  const equalsIndex = normalized.indexOf('=')
  if (equalsIndex <= 0 || equalsIndex === normalized.length - 1) return null
  const left = parseExpressionAst(normalized.slice(0, equalsIndex))
  const right = parseExpressionAst(normalized.slice(equalsIndex + 1))
  if (!left || !right) return null
  return { normalized, left, right }
}

function approxEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon
}

function uniqueNumbers(values: number[]): number[] {
  return values.filter((value, index) => values.findIndex((other) => approxEqual(other, value)) === index).sort((a, b) => a - b)
}

function extractEquationCandidate(problemText: string): string {
  const normalized = normalizeMathText(problemText)
  if (!normalized.includes('=')) {
    return normalized
  }

  const start = normalized.search(/(?:sqrt\(|[+-]?(?:\d+(?:\.\d+)?)?\*?x|x)/i)
  if (start >= 0) {
    return normalized.slice(start)
  }

  return normalized
}

function readCoefficient(rawValue: string | undefined, fallback = 1): number {
  if (rawValue == null || rawValue === '') return fallback
  if (rawValue === '+') return fallback
  if (rawValue === '-') return -fallback
  const parsed = Number(rawValue)
  return Number.isFinite(parsed) ? parsed : fallback
}

function solveKnownForms(normalized: string): number[] {
  const linear = normalized.match(/^([+-]?(?:\d+(?:\.\d+)?)?)\*?x([+-]\d+(?:\.\d+)?)?=([+-]?\d+(?:\.\d+)?)$/)
  if (linear) {
    const a = readCoefficient(linear[1])
    const b = linear[2] ? Number(linear[2]) : 0
    const c = Number(linear[3])
    if (a !== 0 && Number.isFinite(b) && Number.isFinite(c)) {
      return [((c - b) / a)]
    }
  }

  const simpleQuadratic = normalized.match(/^([+-]?(?:\d+(?:\.\d+)?)?)\*?x\^2=([+-]?\d+(?:\.\d+)?)$/)
  if (simpleQuadratic) {
    const a = readCoefficient(simpleQuadratic[1])
    const c = Number(simpleQuadratic[2])
    if (a !== 0 && Number.isFinite(c)) {
      const ratio = c / a
      if (ratio < 0) return []
      const root = Math.sqrt(ratio)
      return uniqueNumbers([root, -root])
    }
  }

  const shiftedQuadratic = normalized.match(/^([+-]?(?:\d+(?:\.\d+)?)?)\*?x\^2([+-]\d+(?:\.\d+)?)=0$/)
  if (shiftedQuadratic) {
    const a = readCoefficient(shiftedQuadratic[1])
    const c = Number(shiftedQuadratic[2])
    if (a !== 0 && Number.isFinite(c)) {
      const ratio = -c / a
      if (ratio < 0) return []
      const root = Math.sqrt(ratio)
      return uniqueNumbers([root, -root])
    }
  }

  const generalQuadratic = normalized.match(/^([+-]?(?:\d+(?:\.\d+)?)?)\*?x\^2([+-]?(?:\d+(?:\.\d+)?)?)\*?x([+-]\d+(?:\.\d+)?)=0$/)
  if (generalQuadratic) {
    const a = readCoefficient(generalQuadratic[1])
    const b = readCoefficient(generalQuadratic[2], 0)
    const c = Number(generalQuadratic[3])
    if (a !== 0 && Number.isFinite(b) && Number.isFinite(c)) {
      const discriminant = b * b - 4 * a * c
      if (discriminant < 0) return []
      const sqrtDiscriminant = Math.sqrt(discriminant)
      return uniqueNumbers([
        (-b + sqrtDiscriminant) / (2 * a),
        (-b - sqrtDiscriminant) / (2 * a),
      ])
    }
  }

  const squareRootEquation = normalized.match(/^sqrt\((.+)\)=([+-]?\d+(?:\.\d+)?)$/)
  if (squareRootEquation) {
    const squaredTarget = Number(squareRootEquation[2])
    if (squaredTarget < 0) return []
    return solveEquation(`${squareRootEquation[1]}=${squaredTarget * squaredTarget}`)
  }

  return []
}

function solveEquation(problemText: string): number[] {
  const normalized = extractEquationCandidate(problemText)
  const equation = parseEquation(normalized)
  const knownFormRoots = solveKnownForms(normalized)
  if (knownFormRoots.length > 0) {
    return knownFormRoots
  }
  if (!equation) return []

  const leftPoly = astToPolynomial(equation.left)
  const rightPoly = astToPolynomial(equation.right)
  if (leftPoly && rightPoly) {
    const [constant, linear, quadratic] = subtractPoly(leftPoly, rightPoly)
    if (Math.abs(quadratic) > 1e-8) {
      const discriminant = linear * linear - 4 * quadratic * constant
      if (discriminant < 0) return []
      const sqrtDiscriminant = Math.sqrt(discriminant)
      return uniqueNumbers([
        (-linear + sqrtDiscriminant) / (2 * quadratic),
        (-linear - sqrtDiscriminant) / (2 * quadratic),
      ])
    }

    if (Math.abs(linear) > 1e-8) {
      return [-constant / linear]
    }

    return []
  }

  const sqrtMatch = equation.normalized.match(/^sqrt\((.+)\)=(-?\d+(?:\.\d+)?)$/)
  if (!sqrtMatch) return []

  const leftAst = parseExpressionAst(sqrtMatch[1])
  const rightValue = Number(sqrtMatch[2])
  if (!leftAst || !Number.isFinite(rightValue) || rightValue < 0) return []

  const squared = astToPolynomial(leftAst)
  if (!squared) return []
  const shifted: Polynomial = [squared[0] - rightValue * rightValue, squared[1], squared[2]]
  if (Math.abs(shifted[2]) > 1e-8) {
    const discriminant = shifted[1] * shifted[1] - 4 * shifted[2] * shifted[0]
    if (discriminant < 0) return []
    const sqrtDiscriminant = Math.sqrt(discriminant)
    return uniqueNumbers([
      (-shifted[1] + sqrtDiscriminant) / (2 * shifted[2]),
      (-shifted[1] - sqrtDiscriminant) / (2 * shifted[2]),
    ]).filter((candidate) => evaluateAst(equation.left, candidate) >= 0)
  }

  if (Math.abs(shifted[1]) > 1e-8) {
    return [-(shifted[0]) / shifted[1]].filter((candidate) => evaluateAst(equation.left, candidate) >= 0)
  }

  return []
}

function parseCandidateAnswers(values: string[]): number[] {
  const answers: number[] = []
  for (const value of values) {
    const normalized = normalizeMathText(value)
    const plusMinusMatch = normalized.match(/±(-?\d+(?:\.\d+)?)/)
    if (plusMinusMatch) {
      const magnitude = Number(plusMinusMatch[1])
      if (Number.isFinite(magnitude)) {
        answers.push(magnitude)
        answers.push(-magnitude)
      }
      continue
    }

    const matches = normalized.match(/-?\d+(?:\.\d+)?/g) ?? []
    for (const match of matches) {
      const parsed = Number(match)
      if (Number.isFinite(parsed)) {
        answers.push(parsed)
      }
    }
  }
  return uniqueNumbers(answers)
}

export function validateFinalAnswers(problemText: string, finalAnswers: string[]): FinalAnswerValidation {
  const expectedAnswers = solveEquation(problemText)
  const candidateAnswers = parseCandidateAnswers(finalAnswers)

  if (expectedAnswers.length === 0) {
    return {
      status: candidateAnswers.length > 0 ? 'warning' : 'partial',
      warnings: ['I could not fully verify the final answer with a deterministic math check, so I kept the feedback cautious.'],
      expectedAnswers: [],
      matchedAnswers: [],
    }
  }

  const matchedAnswers = candidateAnswers.filter((candidate) => expectedAnswers.some((expected) => approxEqual(expected, candidate)))
  const hasMissedAnswer = expectedAnswers.some((expected) => !matchedAnswers.some((candidate) => approxEqual(candidate, expected)))
  const hasExtraAnswer = candidateAnswers.some((candidate) => !expectedAnswers.some((expected) => approxEqual(expected, candidate)))
  const warnings: string[] = []

  const missingPlusMinus = expectedAnswers.length === 2
    && approxEqual(expectedAnswers[0], -expectedAnswers[1])
    && (
      !candidateAnswers.some((candidate) => approxEqual(candidate, expectedAnswers[0]))
      || !candidateAnswers.some((candidate) => approxEqual(candidate, expectedAnswers[1]))
    )

  if (missingPlusMinus && candidateAnswers.length === 1) {
    warnings.push('Be careful with square roots here: this kind of problem needs both the positive and the negative answer.')
  }

  if (candidateAnswers.length === 0) {
    warnings.push('I could not find a final numeric answer to check yet.')
    return {
      status: 'partial',
      warnings,
      expectedAnswers,
      matchedAnswers,
    }
  }

  if (!hasMissedAnswer && !hasExtraAnswer) {
    return {
      status: warnings.length > 0 ? 'warning' : 'correct',
      warnings,
      expectedAnswers,
      matchedAnswers,
    }
  }

  warnings.push('The final answer does not match the original equation when I substitute it back in.')

  return {
    status: matchedAnswers.length > 0 ? 'partial' : 'incorrect',
    warnings,
    expectedAnswers,
    matchedAnswers,
  }
}

export function validateStepPair(previousStep: string, currentStep: string, problemText: string): ValidationFinding {
  const previousEquation = parseEquation(previousStep)
  const currentEquation = parseEquation(currentStep)
  const expectedAnswers = solveEquation(problemText)

  if (expectedAnswers.length === 2 && approxEqual(expectedAnswers[0], -expectedAnswers[1])) {
    const currentAnswers = parseCandidateAnswers([currentStep])
    if (currentAnswers.length === 1 && expectedAnswers.some((expected) => approxEqual(expected, currentAnswers[0]))) {
      return {
        status: 'warning',
        warning: 'This step looks almost right, but square-root answers here should include both values.',
        correction: `Try writing both answers: ${expectedAnswers.join(' and ')}.`,
      }
    }
  }

  if (previousEquation && currentEquation) {
    const previousRoots = solveEquation(previousStep)
    const currentRoots = solveEquation(currentStep)
    if (previousRoots.length > 0 && currentRoots.length > 0) {
      const sameRoots = previousRoots.length === currentRoots.length
        && previousRoots.every((root) => currentRoots.some((candidate) => approxEqual(candidate, root)))

      if (sameRoots) {
        return {
          status: 'correct',
          hint: 'You kept the equation balanced while moving to the next step.',
        }
      }
    }
  }

  const finalAnswerCheck = validateFinalAnswers(problemText, [currentStep])
  if (finalAnswerCheck.status === 'incorrect') {
    return {
      status: 'warning',
      warning: finalAnswerCheck.warnings[0],
      correction: 'Check how this step changes both sides of the equation before moving on.',
    }
  }

  return {
    status: 'partial',
    hint: 'This step may be okay, but the validator could not confirm it with high confidence.',
  }
}

export function detectCommonMistakes(problemText: string, finalAnswers: string[], steps: TutorStepAnalysis[]): string[] {
  const warnings = validateFinalAnswers(problemText, finalAnswers).warnings
  const nextWarnings = [...warnings]

  for (let index = 1; index < steps.length; index += 1) {
    const previous = steps[index - 1]
    const current = steps[index]
    const finding = validateStepPair(previous.normalizedMath || previous.studentText, current.normalizedMath || current.studentText, problemText)
    if (finding.warning) {
      nextWarnings.push(finding.warning)
    }
  }

  return nextWarnings.filter((warning, index) => nextWarnings.indexOf(warning) === index)
}

function mergeFinding(step: TutorStepAnalysis, finding: ValidationFinding): TutorStepAnalysis {
  const nextStep = { ...step }
  if (step.status === 'correct' && finding.status !== 'correct') {
    nextStep.status = finding.status
  }
  if (!nextStep.correction && finding.correction) {
    nextStep.correction = finding.correction
  }
  if (!nextStep.hint && finding.hint) {
    nextStep.hint = finding.hint
  }
  if (finding.warning && !nextStep.kidFriendlyExplanation.includes(finding.warning)) {
    nextStep.kidFriendlyExplanation = `${nextStep.kidFriendlyExplanation} ${finding.warning}`.trim()
  }
  return nextStep
}

export function applyMathValidator(result: TutorAnalysisResult): TutorAnalysisResult {
  const finalAnswerValidation = validateFinalAnswers(result.problemText, result.finalAnswers)
  const validatedSteps = result.steps.map((step, index) => {
    const sourceText = step.normalizedMath || step.studentText
    if (index === result.steps.length - 1 && sourceText) {
      return mergeFinding(step, {
        status: finalAnswerValidation.status,
        warning: finalAnswerValidation.warnings[0],
        correction:
          finalAnswerValidation.status !== 'correct' && finalAnswerValidation.expectedAnswers.length > 0
            ? `Try checking the answer by substitution. The validator found ${finalAnswerValidation.expectedAnswers.join(' and ')}.`
            : undefined,
      })
    }

    if (index === 0) {
      return step
    }

    const previous = result.steps[index - 1]
    return mergeFinding(
      step,
      validateStepPair(previous.normalizedMath || previous.studentText, sourceText, result.problemText),
    )
  })

  const warnings = [
    ...result.validatorWarnings,
    ...finalAnswerValidation.warnings,
    ...detectCommonMistakes(result.problemText, result.finalAnswers, result.steps),
  ].filter((warning, index, list) => warning.trim() && list.indexOf(warning) === index)

  return {
    ...result,
    steps: validatedSteps,
    validatorWarnings: warnings,
    canAnimate: result.canAnimate && validatedSteps.length > 1,
  }
}