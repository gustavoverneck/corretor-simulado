export const QUESTION_AREA_SUGGESTIONS = [
  'Linguagens',
  'Língua Portuguesa',
  'Literatura',
  'Língua Inglesa',
  'Matemática',
  'Ciências da Natureza',
  'Biologia',
  'Física',
  'Química',
  'Ciências Humanas',
  'História',
  'Geografia',
  'Filosofia',
  'Sociologia',
]

export function buildDefaultQuestionAreas(questionCount, subjects = []) {
  const available = subjects.map((subject) => String(subject || '').trim()).filter(Boolean)
  if (!available.length) return Array(questionCount).fill('Sem área definida')
  return Array.from({ length: questionCount }, (_, index) => {
    const subjectIndex = Math.min(available.length - 1, Math.floor((index * available.length) / questionCount))
    return available[subjectIndex]
  })
}

export function getQuestionAreas(assessment) {
  if (!assessment) return []
  const defaults = buildDefaultQuestionAreas(assessment.questionCount, assessment.subjects)
  return Array.from({ length: assessment.questionCount }, (_, index) => {
    const configured = String(assessment.questionAreas?.[index] || '').trim()
    return configured || defaults[index]
  })
}

export function uniqueQuestionAreas(assessment) {
  return [...new Set(getQuestionAreas(assessment))]
}
