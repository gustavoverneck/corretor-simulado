// Escala da nota nas exportações: 0 a 10, 0 a 20, 0 a 100 ou um máximo personalizado.
export const GRADE_SCALE_PRESETS = [10, 20, 100]
export const MAX_GRADE_LIMIT = 100
const STORAGE_KEY = 'corretor-simulado:escala-nota'
const ROUNDING_STORAGE_KEY = 'corretor-simulado:arredondamento-nota'

export const ROUNDING_MODES = [
  { id: 'nearest', label: 'Normal (mais próximo)' },
  { id: 'up', label: 'Para cima' },
  { id: 'down', label: 'Para baixo' },
]
export const ROUNDING_STEPS = [
  { value: 0.1, label: '1 casa decimal' },
  { value: 0.5, label: 'Meio ponto (0,5)' },
  { value: 1, label: 'Número inteiro' },
]
export const DEFAULT_ROUNDING = { mode: 'nearest', step: 0.1 }

export function normalizeRounding(rounding) {
  const mode = ROUNDING_MODES.some((item) => item.id === rounding?.mode) ? rounding.mode : DEFAULT_ROUNDING.mode
  const step = ROUNDING_STEPS.some((item) => item.value === Number(rounding?.step)) ? Number(rounding.step) : DEFAULT_ROUNDING.step
  return { mode, step }
}

export function roundGrade(value, rounding = DEFAULT_ROUNDING) {
  if (!Number.isFinite(value)) return null
  const { mode, step } = normalizeRounding(rounding)
  const factor = 1 / step
  // Remove o ruído de ponto flutuante (3/10 × 10 = 3,0000000000000004) antes de arredondar para cima.
  const scaled = Math.round(value * factor * 1e6) / 1e6
  const rounded = mode === 'up' ? Math.ceil(scaled) : mode === 'down' ? Math.floor(scaled) : Math.round(scaled)
  return rounded / factor
}

// Fórmula equivalente para a planilha: ROUND, ROUNDUP ou ROUNDDOWN sobre o valor multiplicado pelo passo.
export function roundingFormula(expression, rounding = DEFAULT_ROUNDING) {
  const { mode, step } = normalizeRounding(rounding)
  const fn = mode === 'up' ? 'ROUNDUP' : mode === 'down' ? 'ROUNDDOWN' : 'ROUND'
  const factor = 1 / step
  return factor === 10 ? `${fn}(${expression},1)` : factor === 1 ? `${fn}(${expression},0)` : `${fn}((${expression})*${factor},0)/${factor}`
}

export function roundingDescription(rounding = DEFAULT_ROUNDING) {
  const { mode, step } = normalizeRounding(rounding)
  const target = step === 1 ? 'sem casas decimais' : step === 0.5 ? 'em meios pontos (0,5)' : 'com uma casa decimal'
  const direction = mode === 'up' ? 'arredondada para cima' : mode === 'down' ? 'arredondada para baixo' : 'arredondamento normal'
  return `${direction}, ${target}`
}

export function parseMaxGrade(value) {
  const parsed = Number(String(value ?? '').trim().replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_GRADE_LIMIT ? parsed : null
}

// Mesma regra da exportação para o SEGES: proporcional aos acertos e arredondada conforme a escolha.
export function scaleGrade(correct, total, maxGrade, rounding = DEFAULT_ROUNDING) {
  if (!total || !Number.isFinite(correct) || !maxGrade) return null
  return roundGrade(correct / total * maxGrade, rounding)
}

export function formatMaxGrade(maxGrade) {
  return String(maxGrade).replace('.', ',')
}

export function gradeScaleLabel(maxGrade) {
  return `Nota (0 a ${formatMaxGrade(maxGrade)})`
}

export function loadPreferredMaxGrade() {
  try { return parseMaxGrade(localStorage.getItem(STORAGE_KEY)) || 10 } catch { return 10 }
}

export function savePreferredMaxGrade(maxGrade) {
  try { localStorage.setItem(STORAGE_KEY, String(maxGrade)) } catch { /* a escolha volta ao padrão na próxima vez */ }
}

export function loadPreferredRounding() {
  try { return normalizeRounding(JSON.parse(localStorage.getItem(ROUNDING_STORAGE_KEY) || 'null')) } catch { return { ...DEFAULT_ROUNDING } }
}

export function savePreferredRounding(rounding) {
  try { localStorage.setItem(ROUNDING_STORAGE_KEY, JSON.stringify(normalizeRounding(rounding))) } catch { /* volta ao padrão na próxima vez */ }
}
