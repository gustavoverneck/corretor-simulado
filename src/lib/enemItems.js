import { getAnswerKeyVersions } from './assessment.js'
import { ENEM_AREAS } from './enemTri.js'

// Parâmetros oficiais gravados para a versão usada na folha.
export function enemTriForSubmission(assessment, submission) {
  const versions = assessment?.tri?.enem?.versions || []
  const byId = versions.find((item) => item.versionId && item.versionId === submission.answerKeyVersionId)
  if (byId) return byId
  const signature = JSON.stringify(submission.answerKeySnapshot || [])
  return versions.find((item) => item.keySignature === signature) || (versions.length === 1 && getAnswerKeyVersions(assessment).length === 1 ? versions[0] : null)
}

// ---------- Questões do ENEM entre versões ----------

// Com os parâmetros oficiais aplicados, cada posição de cada versão sabe qual
// item do INEP está ali. Isso permite juntar as cores (que só mudam a ordem)
// numa análise por questão. A numeração segue a versão de referência (a azul,
// se houver). Ficam só os itens presentes em todas as versões usadas: as
// questões de inglês e espanhol são itens diferentes e continuam por versão.
export function enemItemsReady(assessment) {
  const versions = assessment?.tri?.enem?.versions || []
  return versions.length > 0 && versions.every((version) => version.items?.some((item) => item?.item))
}

export function enemItemGroup(assessment, submissions) {
  if (!enemItemsReady(assessment)) return null
  const rows = []
  const usedVersions = new Map()
  submissions.forEach((submission) => {
    if (submission.assessmentId !== assessment.id || !Array.isArray(submission.answers)) return
    const version = enemTriForSubmission(assessment, submission)
    if (!version) return
    usedVersions.set(version.versionId, version)
    rows.push({ submission, version })
  })
  if (usedVersions.size < 2) return null
  const assessmentVersions = getAnswerKeyVersions(assessment)
  const ordered = [...usedVersions.values()].sort((a, b) => assessmentVersions.findIndex((item) => item.id === a.versionId) - assessmentVersions.findIndex((item) => item.id === b.versionId))
  const reference = ordered.find((version) => /azul/i.test(version.label)) || ordered[0]
  const positions = new Map(ordered.map((version) => [version.versionId, new Map(version.items.map((item, index) => [item?.item, index]).filter(([code]) => code))]))
  const referenceKey = assessmentVersions.find((item) => item.id === reference.versionId)?.answerKey || []
  const questions = reference.items.map((item, index) => item?.item && ordered.every((version) => positions.get(version.versionId).has(item.item))
    ? { code: item.item, number: index + 1, area: ENEM_AREAS[item.area] || item.area, key: referenceKey[index] ?? null, b: item.b }
    : null).filter(Boolean)
  if (!questions.length) return null
  const remapped = rows.map(({ submission, version }) => {
    const map = positions.get(version.versionId)
    return { ...submission, answers: questions.map((question, index) => ({ ...submission.answers[map.get(question.code)], question: index + 1 })) }
  })
  const answerKey = questions.map((question) => question.key)
  return {
    id: 'enem-items',
    label: `Todas as versões (numeração ${reference.label})`,
    referenceLabel: reference.label,
    answerKey,
    questions,
    excluded: reference.items.filter(Boolean).length - questions.length,
    assessment: { ...assessment, questionCount: questions.length, answerKey, questionAreas: questions.map((question) => question.area), answerKeyVersions: [] },
    submissions: remapped,
  }
}
