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
  deterministic?: boolean
}

type FinalAnswerValidation = {
  status: TutorStepStatus
  warnings: string[]
  expectedAnswers: number[]
  matchedAnswers: number[]
}

type SimpleLinearEquation = {
  leftCoefficient: number
  leftConstant: number
  rightCoefficient: number
  rightConstant: number
}

const SHOULD_LOG_TUTOR_FIX_DEBUG = process.env.NODE_ENV !== 'production'

function tutorFixDebug(label: string, details: Record<string, unknown>): void {
  if (!SHOULD_LOG_TUTOR_FIX_DEBUG) return
  console.info('[TUTOR-FIX-DEBUG]', label, details)
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

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return `${value}`
  if (approxEqual(value, Math.round(value))) return `${Math.round(value)}`
  return `${Number(value.toFixed(4))}`
}

function formatSignedNumber(value: number): string {
  if (value < 0) return `- ${formatNumber(Math.abs(value))}`
  return `+ ${formatNumber(value)}`
}

function formatLinearExpression(coefficient: number, constant: number): string {
  const coeffText = approxEqual(coefficient, 1)
    ? 'x'
    : approxEqual(coefficient, -1)
      ? '-x'
      : `${formatNumber(coefficient)}x`

  if (approxEqual(constant, 0)) return coeffText
  return `${coeffText} ${formatSignedNumber(constant)}`
}

function formatLinearEquation(equation: SimpleLinearEquation): string {
  return `${formatLinearExpression(equation.leftCoefficient - equation.rightCoefficient, equation.leftConstant)} = ${formatNumber(equation.rightConstant)}`
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

function parseSimpleLinearEquation(text: string): SimpleLinearEquation | null {
  const equation = parseEquation(text)
  if (equation) {
    const leftPoly = astToPolynomial(equation.left)
    const rightPoly = astToPolynomial(equation.right)
    if (leftPoly && rightPoly && Math.abs(leftPoly[2]) <= 1e-8 && Math.abs(rightPoly[2]) <= 1e-8) {
      return {
        leftCoefficient: leftPoly[1],
        leftConstant: leftPoly[0],
        rightCoefficient: rightPoly[1],
        rightConstant: rightPoly[0],
      }
    }
  }

  const normalized = normalizeMathText(text)
  const equalsIndex = normalized.indexOf('=')
  if (equalsIndex <= 0 || equalsIndex === normalized.length - 1) return null

  const parseSide = (side: string): { coefficient: number; constant: number } | null => {
    if (!side.includes('x')) {
      const constant = Number(side)
      return Number.isFinite(constant) ? { coefficient: 0, constant } : null
    }

    const match = side.match(/^([+-]?(?:(?:\d+(?:\.\d+)?)\*)?)?x(?:([+-]\d+(?:\.\d+)?)?)?$/)
    if (!match) return null

    const rawCoefficient = (match[1] ?? '').replace(/\*/g, '')
    const coefficient = rawCoefficient === '' || rawCoefficient === '+'
      ? 1
      : rawCoefficient === '-'
        ? -1
        : Number(rawCoefficient)
    const constant = match[2] ? Number(match[2]) : 0

    if (!Number.isFinite(coefficient) || !Number.isFinite(constant)) {
      return null
    }

    return { coefficient, constant }
  }

  const leftSide = parseSide(normalized.slice(0, equalsIndex))
  const rightSide = parseSide(normalized.slice(equalsIndex + 1))
  if (!leftSide || !rightSide) return null

  return {
    leftCoefficient: leftSide.coefficient,
    leftConstant: leftSide.constant,
    rightCoefficient: rightSide.coefficient,
    rightConstant: rightSide.constant,
  }
}

function validateSimpleLinearTransition(previousStep: string, currentStep: string): ValidationFinding | null {
  const previous = parseSimpleLinearEquation(previousStep)
  const current = parseSimpleLinearEquation(currentStep)
  if (!previous || !current) return null

  if (!approxEqual(previous.rightCoefficient, 0) || !approxEqual(current.rightCoefficient, 0)) {
    return null
  }

  if (
    approxEqual(previous.leftCoefficient, current.leftCoefficient)
    && !approxEqual(previous.leftConstant, 0)
    && approxEqual(current.leftConstant, 0)
  ) {
    const expectedRight = previous.rightConstant - previous.leftConstant
    const expectedEquation: SimpleLinearEquation = {
      leftCoefficient: previous.leftCoefficient,
      leftConstant: 0,
      rightCoefficient: 0,
      rightConstant: expectedRight,
    }

    if (!approxEqual(current.rightConstant, expectedRight)) {
      const operation = previous.leftConstant > 0 ? 'Subtract' : 'Add'
      const magnitude = Math.abs(previous.leftConstant)
      return {
        status: 'incorrect',
        deterministic: true,
        warning: `This arithmetic is off. ${formatNumber(previous.rightConstant)} ${previous.leftConstant > 0 ? '-' : '+'} ${formatNumber(magnitude)} should be ${formatNumber(expectedRight)}.`,
        correction: `${operation} ${formatNumber(magnitude)} on both sides to get ${formatLinearEquation(expectedEquation)}.`,
        hint: 'Fix this arithmetic step before checking the next line.',
      }
    }

    return {
      status: 'correct',
      deterministic: true,
      hint: 'Good. This keeps the equation balanced while removing the constant term.',
    }
  }

  if (
    approxEqual(previous.leftConstant, 0)
    && !approxEqual(previous.leftCoefficient, 0)
    && approxEqual(current.leftCoefficient, 1)
    && approxEqual(current.leftConstant, 0)
  ) {
    const expectedRight = previous.rightConstant / previous.leftCoefficient
    if (!approxEqual(current.rightConstant, expectedRight)) {
      return {
        status: 'incorrect',
        deterministic: true,
        warning: `This division is off. ${formatNumber(previous.rightConstant)} ÷ ${formatNumber(previous.leftCoefficient)} should be ${formatNumber(expectedRight)}.`,
        correction: `Divide both sides by ${formatNumber(previous.leftCoefficient)} to get x = ${formatNumber(expectedRight)}.`,
        hint: 'Finish isolating x by dividing both sides correctly.',
      }
    }

    return {
      status: 'correct',
      deterministic: true,
      hint: 'Good. Dividing both sides by the coefficient isolates x.',
    }
  }

  return null
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

  tutorFixDebug('deterministic-final-answer-check', {
    problemText,
    finalAnswers,
    expectedAnswers,
    candidateAnswers,
  })

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
  const linearTransitionFinding = validateSimpleLinearTransition(previousStep, currentStep)
  if (linearTransitionFinding) {
    return linearTransitionFinding
  }

  const previousEquation = parseEquation(previousStep)
  const currentEquation = parseEquation(currentStep)
  const expectedAnswers = solveEquation(problemText)

  if (expectedAnswers.length === 2 && approxEqual(expectedAnswers[0], -expectedAnswers[1])) {
    const currentAnswers = parseCandidateAnswers([currentStep])
    if (currentAnswers.length === 1 && expectedAnswers.some((expected) => approxEqual(expected, currentAnswers[0]))) {
      return {
        status: 'warning',
        deterministic: true,
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
          deterministic: true,
          hint: 'You kept the equation balanced while moving to the next step.',
        }
      }
    }
  }

  const finalAnswerCheck = validateFinalAnswers(problemText, [currentStep])
  if (finalAnswerCheck.status === 'incorrect') {
    return {
      status: 'incorrect',
      deterministic: true,
      warning: finalAnswerCheck.warnings[0],
      correction: 'Check how this step changes both sides of the equation before moving on.',
    }
  }

  return {
    status: 'partial',
    deterministic: false,
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
  if (finding.deterministic) {
    nextStep.status = finding.status
  } else if (step.status === 'correct' && finding.status !== 'correct') {
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

function looksLikePraise(text: string | undefined): boolean {
  if (!text) return false
  return /(great job|great start|nice work|good job|well done|awesome|perfect|you are close|you did it|correctly)/i.test(text)
}

function sanitizeStepCopy(step: TutorStepAnalysis): TutorStepAnalysis {
  if (step.status === 'correct') {
    return step
  }

  const baseExplanation = step.status === 'incorrect'
    ? 'This step is the first place where the math goes off track.'
    : step.status === 'partial'
      ? 'This step needs one more check before moving on.'
      : 'Pause here and double-check this line before continuing.'

  return {
    ...step,
    kidFriendlyExplanation: looksLikePraise(step.kidFriendlyExplanation)
      ? baseExplanation
      : step.kidFriendlyExplanation || baseExplanation,
  }
}

function markDownstreamSteps(steps: TutorStepAnalysis[]): TutorStepAnalysis[] {
  const firstBlockingIndex = steps.findIndex((step) => step.status !== 'correct')
  if (firstBlockingIndex < 0) return steps

  return steps.map((step, index) => {
    if (index <= firstBlockingIndex) {
      return sanitizeStepCopy(step)
    }

    return {
      ...step,
      status: 'warning',
      kidFriendlyExplanation: `This line follows the earlier mistake from step ${firstBlockingIndex + 1}, so fix that step first.`,
      correction: `Recheck step ${firstBlockingIndex + 1} first, then come back to this line.`,
      hint: step.hint,
    }
  })
}

function buildConsistentSummary(summary: string, steps: TutorStepAnalysis[]): string {
  const firstBlockingIndex = steps.findIndex((step) => step.status !== 'correct')
  if (firstBlockingIndex < 0) {
    return summary || 'The work is consistent and the final answer checks out.'
  }

  return `Start by fixing step ${firstBlockingIndex + 1}. After that, re-check the later work in order.`
}

export function applyMathValidator(result: TutorAnalysisResult): TutorAnalysisResult {
  const finalAnswerValidation = validateFinalAnswers(result.problemText, result.finalAnswers)
  const validatedSteps = result.steps.map((step, index) => {
    const sourceText = step.normalizedMath || step.studentText
    if (index === result.steps.length - 1 && sourceText) {
      return mergeFinding(step, {
        status: finalAnswerValidation.status,
        warning: finalAnswerValidation.warnings[0],
        deterministic: finalAnswerValidation.expectedAnswers.length > 0,
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

  const consistentSteps = markDownstreamSteps(validatedSteps)
  const firstBlockingStep = consistentSteps.find((step) => step.status !== 'correct') ?? null

  const warnings = [
    ...result.validatorWarnings,
    ...finalAnswerValidation.warnings,
    ...detectCommonMistakes(result.problemText, result.finalAnswers, result.steps),
  ].filter((warning, index, list) => warning.trim() && list.indexOf(warning) === index)

  tutorFixDebug('deterministic-step-check-summary', {
    problemText: result.problemText,
    firstBlockingStep: firstBlockingStep ? {
      index: firstBlockingStep.index,
      shortLabel: firstBlockingStep.shortLabel,
      status: firstBlockingStep.status,
      studentText: firstBlockingStep.studentText,
    } : null,
    finalAnswerValidation,
  })

  return {
    ...result,
    overallSummary: buildConsistentSummary(result.overallSummary, consistentSteps),
    steps: consistentSteps,
    validatorWarnings: warnings,
    canAnimate: result.canAnimate && consistentSteps.length > 1,
  }
}