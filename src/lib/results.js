import { calculateQuestionResults as questionResults } from './resultsMetrics.js'
export { calculateSubmissionMetrics, calculateAreaResults } from './resultsMetrics.js'

export function calculateQuestionResults(assessments, submissions, selectedAreas = []) {
  return questionResults(assessments, submissions, selectedAreas).map((item) => ({ ...item, key: item.id }))
}

export function resolveSelection(selected, available, fallback = available) {
  const current = selected.filter((value) => available.includes(value))
  return current.length ? current : fallback.filter((value) => available.includes(value))
}
