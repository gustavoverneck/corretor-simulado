import { createInitialState } from '../data'
import { getQuestionAreas } from './knowledgeAreas'
import { normalizeSubmissionVoid } from './voidedSubmission'

// Ajusta dados salvos (ou recebidos pela rede local) ao formato atual do app.
export function normalizeState(parsed) {
  if (!parsed) return createInitialState()
  const assessments = Array.isArray(parsed?.assessments)
    ? parsed.assessments.map((assessment) => ({ ...assessment, questionAreas: getQuestionAreas(assessment) }))
    : parsed.assessments
  const submissions = Array.isArray(parsed?.submissions) ? parsed.submissions.map(normalizeSubmissionVoid) : parsed.submissions
  return { ...parsed, assessments, submissions }
}
