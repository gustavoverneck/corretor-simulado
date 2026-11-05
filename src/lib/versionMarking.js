// Campos de "tipo de prova" impressos na folha (cor, idioma…). O aluno marca
// uma bolha por campo e a correção escolhe a versão do gabarito por ela.
//
// A geometria impressa depende só da quantidade de opções de cada campo, que
// vai no QR (por exemplo "4.2"). Assim uma folha já impressa continua sendo
// lida mesmo que os nomes das opções mudem depois.
import { getAnswerKeyVersionForStudent, getAnswerKeyVersions, getAnswerKeyVersionsForClass } from './assessment.js'

export const MAX_MARKING_FIELDS = 2
export const MIN_MARKING_OPTIONS = 2
export const MAX_MARKING_OPTIONS = 6
export const MARKING_BUBBLE_RADIUS = 6.5

const BOX = { left: 65, top: 311, width: 643, height: 52 }
const LABEL_X = 84
const FIRST_BUBBLE_X = 212
const LAST_BUBBLE_X = 640

const normalize = (value) => String(value ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim()

export function validMarkingGrid(grid) {
  return Array.isArray(grid) && grid.length >= 1 && grid.length <= MAX_MARKING_FIELDS
    && grid.every((count) => Number.isInteger(count) && count >= MIN_MARKING_OPTIONS && count <= MAX_MARKING_OPTIONS)
}

export function encodeMarkingGrid(grid) {
  return validMarkingGrid(grid) ? grid.join('.') : ''
}

export function decodeMarkingGrid(text) {
  if (!/^\d(\.\d)?$/.test(String(text || ''))) return null
  const grid = String(text).split('.').map(Number)
  return validMarkingGrid(grid) ? grid : null
}

// Posições (no sistema de coordenadas da folha, 794×1123) de cada bolha.
export function markingLayout(grid) {
  if (!validMarkingGrid(grid)) return null
  const rowYs = grid.length === 1 ? [BOX.top + BOX.height / 2] : [BOX.top + 17, BOX.top + 35]
  return {
    box: BOX,
    labelX: LABEL_X,
    radius: MARKING_BUBBLE_RADIUS,
    rows: grid.map((count, field) => {
      const step = Math.min(84, (LAST_BUBBLE_X - FIRST_BUBBLE_X) / Math.max(1, count - 1))
      return {
        y: rowYs[field],
        bubbles: Array.from({ length: count }, (_, option) => ({ x: FIRST_BUBBLE_X + option * step, y: rowYs[field] })),
      }
    }),
  }
}

// Configuração salva no simulado, já limpa e limitada ao que cabe na folha.
export function getVersionMarking(assessment) {
  const fields = (assessment?.versionMarking?.fields || [])
    .map((field) => ({
      id: String(field.id || ''),
      label: String(field.label || '').trim(),
      options: (field.options || []).map((option) => String(option || '').trim()).filter(Boolean).slice(0, MAX_MARKING_OPTIONS),
    }))
    .filter((field) => field.id && field.label && field.options.length >= MIN_MARKING_OPTIONS)
    .slice(0, MAX_MARKING_FIELDS)
  return fields.length ? { fields } : null
}

function versionsOfSize(assessment, versions, questionCount) {
  return versions.filter((version) => (version.questionCount ?? version.answerKey?.length ?? assessment.questionCount) === questionCount)
}

// A folha só recebe o campo quando há escolha a fazer: a turma (ou, na folha
// sem aluno, alguma turma) tem duas ou mais versões do mesmo tamanho.
export function markingGridForSheet(assessment, student, questionCount) {
  const marking = getVersionMarking(assessment)
  if (!marking) return null
  const candidateGroups = student
    ? [getAnswerKeyVersionsForClass(assessment, student.classId)]
    : (assessment.classIds || []).map((classId) => getAnswerKeyVersionsForClass(assessment, classId))
  const hasChoice = candidateGroups.some((versions) => versionsOfSize(assessment, versions, questionCount).length >= 2)
  return hasChoice ? marking.fields.map((field) => field.options.length) : null
}

// Versão cujas opções combinam com as bolhas marcadas. Campos sem marcação
// não restringem; ainda assim precisa sobrar exatamente uma versão.
export function findMarkedVersion(assessment, classId, selections, questionCount) {
  const marking = getVersionMarking(assessment)
  if (!marking || !Array.isArray(selections)) return null
  const pool = classId ? getAnswerKeyVersionsForClass(assessment, classId) : getAnswerKeyVersions(assessment)
  const candidates = versionsOfSize(assessment, pool, questionCount).filter((version) => marking.fields.every((field, index) => {
    const selected = selections[index]
    if (selected === null || selected === undefined) return true
    return version.markingValues?.[field.id] === selected
  }))
  return candidates.length === 1 ? candidates[0] : null
}

export function describeMarkingSelection(assessment, selections) {
  const marking = getVersionMarking(assessment)
  if (!marking) return ''
  return marking.fields
    .map((field, index) => Number.isInteger(selections?.[index]) ? field.options[selections[index]] : null)
    .filter(Boolean)
    .join(' · ')
}

// Sugestão a partir dos nomes das versões ("amarelo-ING", "Verde / Espanhol"):
// cada parte do nome vira um campo. Cores e idiomas ganham nomes por extenso.
const COLORS = ['amarelo', 'amarela', 'azul', 'verde', 'branco', 'branca', 'cinza', 'rosa', 'laranja', 'vermelho', 'roxo', 'lilas', 'preto', 'marrom', 'bege']
const LANGUAGES = { ing: 'Inglês', ingles: 'Inglês', esp: 'Espanhol', espanhol: 'Espanhol', fra: 'Francês', frances: 'Francês' }
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

function labelParts(label) {
  return String(label || '').split(/\s*[-/|·,]\s*|\s+/).map((part) => part.trim()).filter(Boolean)
}

function displayOption(part) {
  const key = normalize(part)
  if (LANGUAGES[key]) return LANGUAGES[key]
  if (key === 'amarela') return 'Amarelo'
  if (key === 'branca') return 'Branco'
  return capitalize(part.toLowerCase())
}

export function suggestVersionMarking(versions, createId = (index) => `field-${index + 1}`) {
  const parts = versions.map((version) => labelParts(version.label))
  const width = Math.min(MAX_MARKING_FIELDS, Math.max(0, ...parts.map((list) => list.length)))
  const fields = []
  for (let index = 0; index < width; index += 1) {
    const options = [...new Set(parts.map((list) => list[index]).filter(Boolean).map(displayOption))]
    if (options.length < MIN_MARKING_OPTIONS || options.length > MAX_MARKING_OPTIONS) continue
    const normalized = options.map(normalize)
    const label = normalized.every((option) => COLORS.includes(option)) ? 'Cor da prova'
      : normalized.every((option) => Object.values(LANGUAGES).map(normalize).includes(option)) ? 'Idioma'
      : `Tipo ${fields.length + 1}`
    fields.push({ id: createId(fields.length), label, options })
  }
  return fields
}

// Preenche as opções de cada versão a partir do nome dela, sem sobrescrever o
// que o professor já escolheu.
export function guessMarkingValues(version, fields) {
  const parts = labelParts(version.label).map((part) => normalize(displayOption(part)))
  const values = { ...(version.markingValues || {}) }
  for (const field of fields) {
    if (Number.isInteger(values[field.id]) && values[field.id] < field.options.length) continue
    const match = field.options.findIndex((option) => {
      const target = normalize(option)
      return parts.some((part) => part === target || (part.length >= 3 && target.startsWith(part)) || (target.length >= 3 && part.startsWith(target)))
    })
    if (match >= 0) values[field.id] = match
    else delete values[field.id]
  }
  return values
}

// Problemas que impedem a leitura de escolher a versão com segurança.
export function markingProblems(assessment, fields, versions) {
  const problems = []
  for (const classId of assessment.classIds || []) {
    const classVersions = (assessment.answerKeyVersionIdsByClass?.[classId] || [])
      .map((id) => versions.find((version) => version.id === id)).filter(Boolean)
    if (classVersions.length < 2) continue
    const seen = new Map()
    for (const version of classVersions) {
      const missing = fields.filter((field) => !Number.isInteger(version.markingValues?.[field.id]))
      if (missing.length) {
        problems.push({ kind: 'missing', versionId: version.id, message: `${version.label}: escolha ${missing.map((field) => field.label.toLowerCase()).join(' e ')}.` })
        continue
      }
      const key = `${version.questionCount ?? version.answerKey?.length}:${fields.map((field) => version.markingValues[field.id]).join('|')}`
      if (seen.has(key) && seen.get(key) !== version.id) {
        const other = versions.find((item) => item.id === seen.get(key))
        problems.push({ kind: 'duplicate', versionId: version.id, message: `${other?.label} e ${version.label} têm as mesmas marcações; a folha não conseguiria diferenciá-las.` })
      } else seen.set(key, version.id)
    }
  }
  return problems.filter((problem, index, list) => list.findIndex((item) => item.message === problem.message) === index)
}

// Versão usada para corrigir uma folha lida: a marcada pelo aluno, quando
// ela aponta uma única versão da turma; senão a cadastrada, com o motivo
// para a folha ir à revisão.
export function resolveSheetVersion(assessment, student, result) {
  const registered = getAnswerKeyVersionForStudent(assessment, student)
  if (!assessment || !student || !Array.isArray(result?.versionMarks)) return { version: registered, source: 'registered', problem: null, changed: false }
  const fields = getVersionMarking(assessment)?.fields || []
  const selections = result.versionMarks.map((field) => field.selected ?? null)
  const questionCount = result.answers?.length ?? registered?.answerKey?.length
  const marked = fields.length === result.versionMarks.length ? findMarkedVersion(assessment, student.classId, selections, questionCount) : null
  const reading = describeMarkingSelection(assessment, selections)
  if (marked) return { version: marked, source: 'sheet', reading, problem: null, changed: marked.id !== registered?.id }
  const label = (index) => fields[index]?.label || `Campo ${index + 1}`
  const issues = result.versionMarks.map((field, index) => (
    field.status === 'blank' ? `${label(index)} sem marcação`
      : field.status === 'multiple' ? `${label(index)} com mais de uma marcação`
      : field.status === 'uncertain' ? `${label(index)} com marcação duvidosa`
      : null
  )).filter(Boolean)
  const reason = issues.length ? issues.join(' e ')
    : fields.length !== result.versionMarks.length ? 'Os campos de tipo de prova mudaram depois da impressão'
    : `${reading || 'A marcação'} não corresponde a uma única versão da turma`
  return {
    version: registered,
    source: 'registered',
    reading,
    changed: false,
    problem: `${reason}; usada a versão cadastrada (${registered?.label || 'gabarito da turma'})`,
  }
}
