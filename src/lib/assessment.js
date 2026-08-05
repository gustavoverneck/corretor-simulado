export function getAnswerKeyForClass(assessment, classId) {
  if (!assessment) return []
  const classKey = assessment.answerKeysByClass?.[classId]
  if (Array.isArray(classKey) && classKey.length === assessment.questionCount) return classKey
  return Array.isArray(assessment.answerKey) ? assessment.answerKey : []
}

export function hasCustomAnswerKey(assessment, classId) {
  const classKey = assessment?.answerKeysByClass?.[classId]
  if (!Array.isArray(classKey)) return false
  return classKey.some((answer, index) => answer !== assessment.answerKey?.[index])
}

export function summarizeAnswers(answers) {
  const counts = answers.reduce((summary, answer) => {
    summary[answer.status] = (summary[answer.status] || 0) + 1
    return summary
  }, {})
  const total = answers.length || 1
  return {
    correct: counts.correct || 0,
    wrong: counts.wrong || 0,
    blank: counts.blank || 0,
    multiple: counts.multiple || 0,
    uncertain: counts.uncertain || 0,
    score: Math.round(((counts.correct || 0) / total) * 100),
  }
}

export function regradeAnswers(answers, answerKey, { preserveUncertain = true } = {}) {
  const graded = answers.map((answer, index) => {
    const expected = answerKey[index]
    const selected = Array.isArray(answer.selected) ? answer.selected : []
    let status
    if (preserveUncertain && answer.status === 'uncertain') status = 'uncertain'
    else if (selected.length === 0) status = 'blank'
    else if (selected.length > 1) status = 'multiple'
    else status = selected[0] === expected ? 'correct' : 'wrong'
    return { ...answer, question: index + 1, expected, status }
  })
  return { answers: graded, ...summarizeAnswers(graded) }
}
