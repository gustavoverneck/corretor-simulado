import { CANCELLED_ANSWER } from './assessment.js'
import { getSheetFormat } from './sheetFormat.js'
import { CURRENT_MARKER_LAYOUT } from './omr.js'
import { normalize, uid } from './utils.js'

export const ASSESSMENT_IMPORT_FORMAT = 'sistema-avaliacoes-assessments'

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} não informado.`)
  return value.trim()
}

function resolveClasses(state, packageClasses, classIds) {
  return Object.fromEntries(classIds.map((id) => {
    const direct = state.classes.find((classroom) => classroom.id === id)
    if (direct) return [id, direct.id]
    const reference = packageClasses?.find((classroom) => classroom.id === id)
    const matches = reference ? state.classes.filter((classroom) => (
      normalize(classroom.name) === normalize(reference.name)
      && normalize(classroom.shift) === normalize(reference.shift)
      && Number(classroom.year) === Number(reference.year)
    )) : []
    if (matches.length !== 1) throw new Error(`Turma “${reference?.name || id}” não encontrada de forma inequívoca. Confira o cadastro antes de importar.`)
    return [id, matches[0].id]
  }))
}

export function importAssessmentPackage(state, payload, { createdAt = new Date().toISOString() } = {}) {
  if (payload?.format !== ASSESSMENT_IMPORT_FORMAT || payload.version !== 1 || !Array.isArray(payload.assessments) || !payload.assessments.length) {
    throw new Error('Selecione um pacote de simulados compatível. Este recurso adiciona avaliações; não restaura backups completos.')
  }
  const existingIds = new Set(state.assessments.map((assessment) => assessment.id))
  const existingCodes = new Set(state.assessments.map((assessment) => normalize(assessment.code)))
  const imported = []
  let skipped = 0
  for (const item of payload.assessments) {
    const title = requiredText(item.title, 'Nome do simulado')
    const code = requiredText(item.code, 'Código do simulado').toUpperCase()
    if (existingIds.has(item.id) || existingCodes.has(normalize(code))) { skipped += 1; continue }
    const timestamp = Date.parse(`${item.date}T12:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date || '') || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== item.date) throw new Error(`${code}: data de aplicação inválida.`)
    if (item.contentMode && item.contentMode !== 'key') throw new Error(`${code}: este pacote deve conter somente gabaritos e áreas, sem enunciados de prova.`)
    if (!Number.isInteger(item.optionCount) || item.optionCount < 2 || item.optionCount > 5) throw new Error(`${code}: informe de 2 a 5 alternativas.`)
    if (!Array.isArray(item.classIds) || !item.classIds.length || new Set(item.classIds).size !== item.classIds.length) throw new Error(`${code}: turmas inválidas.`)
    const classMap = resolveClasses(state, payload.classes, item.classIds)
    const classIds = item.classIds.map((id) => classMap[id])
    if (new Set(classIds).size !== classIds.length) throw new Error(`${code}: duas referências apontam para a mesma turma.`)
    if (!Array.isArray(item.answerKeyVersions) || !item.answerKeyVersions.length) throw new Error(`${code}: nenhuma versão de gabarito informada.`)
    const versionIds = new Set()
    const versions = item.answerKeyVersions.map((version) => {
      const id = version.id || uid('version')
      if (versionIds.has(id)) throw new Error(`${code}: versões com o mesmo identificador.`)
      versionIds.add(id)
      const label = requiredText(version.label, `${code}: nome da versão`)
      const count = version.questionCount ?? version.answerKey?.length
      if (!Number.isInteger(count) || count < 1 || count > 90 || !Array.isArray(version.answerKey) || version.answerKey.length !== count) throw new Error(`${code}, ${label}: quantidade de questões inválida.`)
      const key = version.answerKey.map((answer) => typeof answer === 'string' ? answer.trim().toUpperCase() : answer)
      if (key.some((answer) => answer !== null && answer !== CANCELLED_ANSWER && !(typeof answer === 'string' && /^[A-E]$/.test(answer) && answer.charCodeAt(0) - 65 < item.optionCount))) throw new Error(`${code}, ${label}: gabarito incompleto ou com alternativa inválida.`)
      if (!Array.isArray(version.questionAreas) || version.questionAreas.length !== count) throw new Error(`${code}, ${label}: informe a área de todas as questões.`)
      const questionAreas = version.questionAreas.map((area) => requiredText(area, `${code}, ${label}: área da questão`))
      const assignedClassIds = version.classIds || item.classIds
      if (!Array.isArray(assignedClassIds) || assignedClassIds.some((classId) => !item.classIds.includes(classId))) throw new Error(`${code}, ${label}: associação de turmas inválida.`)
      return {
        id, label, questionCount: count, answerKey: key, questionAreas,
        subjects: [...new Set(questionAreas)],
        classIds: [...new Set(assignedClassIds.map((classId) => classMap[classId]))],
        ...(version.source ? { source: version.source } : {}),
      }
    })
    const answerKeyVersionIdsByClass = Object.fromEntries(classIds.map((classId) => [classId, versions.filter((version) => version.classIds.includes(classId)).map((version) => version.id)]))
    if (Object.values(answerKeyVersionIdsByClass).some((ids) => !ids.length)) throw new Error(`${code}: uma das turmas ficou sem versão.`)
    const answerKeyVersionIdByStudent = Object.fromEntries(classIds.flatMap((classId) => {
      const ids = answerKeyVersionIdsByClass[classId]
      return state.students.filter((student) => student.classId === classId).map((student, index) => [student.id, ids[index % ids.length]])
    }))
    const first = versions[0]
    const assessment = {
      id: item.id || uid('assessment'), title, code, date: item.date,
      subjects: [...new Set(versions.flatMap((version) => version.subjects))],
      classIds, questionCount: first.questionCount, optionCount: item.optionCount,
      contentMode: 'key', answerKey: first.answerKey, questionAreas: first.questionAreas,
      answerKeyVersions: versions, answerKeyVersionIdsByClass, answerKeyVersionIdByStudent,
      answerKeysByClass: Object.fromEntries(classIds.map((classId) => [classId, versions.find((version) => version.id === answerKeyVersionIdsByClass[classId][0]).answerKey])),
      answerSheetFormat: getSheetFormat(first.questionCount, item.optionCount).format,
      answerSheetMarkerLayout: CURRENT_MARKER_LAYOUT,
      status: 'Pronto para aplicar', createdAt,
      ...(item.source ? { source: item.source } : {}),
    }
    imported.push(assessment)
    existingIds.add(assessment.id)
    existingCodes.add(normalize(code))
  }
  return { state: { ...state, assessments: [...imported, ...state.assessments] }, added: imported.length, skipped, assessments: imported }
}
