function stableIndex(value, length) {
  if (!length) return 0
  let hash = 0
  for (const character of String(value || '')) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0
  return Math.abs(hash) % length
}

export function createRandomAnswerKey(questionCount, optionCount, random = Math.random) {
  const count = Math.max(0, Math.floor(Number(questionCount) || 0))
  const alternatives = Math.max(1, Math.floor(Number(optionCount) || 1))
  const letters = Array.from({ length: alternatives }, (_, index) => String.fromCharCode(65 + index))
  const answers = Array.from({ length: count }, (_, index) => letters[index % letters.length])

  for (let index = answers.length - 1; index > 0; index -= 1) {
    const sampled = Math.max(0, Math.min(0.999999999, Number(random()) || 0))
    const target = Math.floor(sampled * (index + 1))
    ;[answers[index], answers[target]] = [answers[target], answers[index]]
  }
  return answers
}

export function getAnswerKeyVersions(assessment) {
  if (!assessment) return []
  const versions = Array.isArray(assessment.answerKeyVersions)
    ? assessment.answerKeyVersions.filter((version) => Array.isArray(version.answerKey) && version.answerKey.length === assessment.questionCount)
    : []
  if (versions.length) return versions
  return [{ id: 'default', label: 'Gabarito padrão', answerKey: Array.isArray(assessment.answerKey) ? assessment.answerKey : [] }]
}

export function getAnswerKeyForClass(assessment, classId) {
  if (!assessment) return []
  const assignedVersionId = assessment.answerKeyVersionIdsByClass?.[classId]?.[0]
  const assignedVersion = getAnswerKeyVersions(assessment).find((version) => version.id === assignedVersionId)
  if (assignedVersion) return assignedVersion.answerKey
  const classKey = assessment.answerKeysByClass?.[classId]
  if (Array.isArray(classKey) && classKey.length === assessment.questionCount) return classKey
  return Array.isArray(assessment.answerKey) ? assessment.answerKey : []
}

export function getAnswerKeyVersionForStudent(assessment, student) {
  if (!assessment || !student) return null
  const versions = getAnswerKeyVersions(assessment)
  const assignedIds = assessment.answerKeyVersionIdsByClass?.[student.classId] || []
  const assignedVersions = assignedIds.map((id) => versions.find((version) => version.id === id)).filter(Boolean)
  const directVersion = versions.find((version) => version.id === assessment.answerKeyVersionIdByStudent?.[student.id])
  if (directVersion && assignedIds.includes(directVersion.id)) return directVersion
  if (assignedVersions.length) return assignedVersions[stableIndex(`${assessment.id}:${student.id}`, assignedVersions.length)]
  return {
    id: 'class-default',
    label: hasCustomAnswerKey(assessment, student.classId) ? 'Gabarito da turma' : 'Gabarito padrão',
    answerKey: getAnswerKeyForClass(assessment, student.classId),
  }
}

export function getAnswerKeyForStudent(assessment, student) {
  return getAnswerKeyVersionForStudent(assessment, student)?.answerKey || getAnswerKeyForClass(assessment, student?.classId)
}

export function getAnswerKeyVersionsForClass(assessment, classId) {
  const versions = getAnswerKeyVersions(assessment)
  const assignedIds = assessment?.answerKeyVersionIdsByClass?.[classId] || []
  return assignedIds.length ? assignedIds.map((id) => versions.find((version) => version.id === id)).filter(Boolean) : []
}

export function hasCustomAnswerKey(assessment, classId) {
  const assignedVersions = getAnswerKeyVersionsForClass(assessment, classId)
  if (assignedVersions.length > 1) return true
  if (assignedVersions.length === 1) return assignedVersions[0].answerKey.some((answer, index) => answer !== assessment.answerKey?.[index])
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
