import { getQuestionAreas } from './knowledgeAreas.js'

export function calculateSubmissionMetrics(submission, assessment, selectedAreas = []) {
  const questionAreas = getQuestionAreas(assessment)
  const questionIndexes = questionAreas
    .map((questionArea, index) => !selectedAreas.length || selectedAreas.includes(questionArea) ? index : -1)
    .filter((index) => index >= 0)

  if (!questionIndexes.length) return null
  if (!Array.isArray(submission.answers)) {
    if (questionIndexes.length !== questionAreas.length) return null
    return {
      total: Number(submission.gradedTotal ?? Math.max(0, assessment.questionCount - Number(submission.cancelled || 0))),
      correct: Number(submission.correct || 0),
      wrong: Number(submission.wrong || 0),
      blank: Number(submission.blank || 0),
      multiple: Number(submission.multiple || 0),
      uncertain: Number(submission.uncertain || 0),
      cancelled: Number(submission.cancelled || 0),
      review: Number(submission.multiple || 0) + Number(submission.uncertain || 0),
      score: Number(submission.score || 0),
    }
  }

  const metrics = { total: 0, correct: 0, wrong: 0, blank: 0, multiple: 0, uncertain: 0, cancelled: 0, review: 0, score: 0 }
  questionIndexes.forEach((index) => {
    const status = submission.answers[index]?.status || 'blank'
    if (status === 'cancelled') {
      metrics.cancelled += 1
      return
    }
    metrics.total += 1
    if (status === 'correct') metrics.correct += 1
    else if (status === 'wrong') metrics.wrong += 1
    else if (status === 'blank') metrics.blank += 1
    else if (status === 'multiple') metrics.multiple += 1
    else if (status === 'uncertain') metrics.uncertain += 1
    else metrics.review += 1
  })
  metrics.review += metrics.multiple + metrics.uncertain
  metrics.score = metrics.total ? Math.round((metrics.correct / metrics.total) * 100) : 0
  return metrics
}

export function calculateAreaResults(assessments, submissions) {
  const summary = new Map()
  assessments.forEach((assessment) => {
    const questionAreas = getQuestionAreas(assessment)
    questionAreas.forEach((area) => {
      if (!summary.has(area)) summary.set(area, { area, questions: 0, attempts: 0, correct: 0, wrong: 0, blank: 0, cancelled: 0, review: 0 })
      summary.get(area).questions += 1
    })
    submissions.filter((submission) => submission.assessmentId === assessment.id).forEach((submission) => {
      if (!Array.isArray(submission.answers)) return
      submission.answers.forEach((answer, index) => {
        const item = summary.get(questionAreas[index])
        if (!item) return
        if (answer.status === 'cancelled') { item.cancelled += 1; return }
        item.attempts += 1
        if (answer.status === 'correct') item.correct += 1
        else if (answer.status === 'wrong') item.wrong += 1
        else if (answer.status === 'blank') item.blank += 1
        else item.review += 1
      })
    })
  })
  return [...summary.values()].map((item) => ({ ...item, score: item.attempts ? Math.round(item.correct / item.attempts * 100) : 0 }))
}

export function calculateQuestionResults(assessments, submissions, selectedAreas = []) {
  return assessments.flatMap((assessment) => {
    const questionAreas = getQuestionAreas(assessment)
    return questionAreas.map((questionArea, index) => {
      if (selectedAreas.length && !selectedAreas.includes(questionArea)) return null
      const result = { id: `${assessment.id}:${index}`, assessmentId: assessment.id, assessmentTitle: assessment.title, assessmentCode: assessment.code, index, number: index + 1, area: questionArea, attempts: 0, correct: 0, wrong: 0, blank: 0, cancelled: 0, review: 0, score: 0 }
      submissions.filter((submission) => submission.assessmentId === assessment.id).forEach((submission) => {
        const answer = submission.answers?.[index]
        if (!answer) return
        if (answer.status === 'cancelled') {
          result.cancelled += 1
          return
        }
        result.attempts += 1
        if (answer.status === 'correct') result.correct += 1
        else if (answer.status === 'wrong') result.wrong += 1
        else if (answer.status === 'blank') result.blank += 1
        else result.review += 1
      })
      result.score = result.attempts ? Math.round((result.correct / result.attempts) * 100) : 0
      return result
    }).filter(Boolean)
  })
}

