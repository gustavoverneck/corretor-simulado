// Prova anulada (ex.: cola): a folha continua registrada, mas a nota não vale.
// Fica fora de médias e análises, aparece marcada nos resultados e não recebe
// nota nas exportações. O registro guarda o motivo e pode ser desfeito.
export const VOID_REASONS = ['Cola', 'Uso de celular ou material não permitido', 'Comunicação com outro aluno', 'Outro']
export const VOIDED_LABEL = 'Anulada'

export function isSubmissionVoided(submission) {
  return Boolean(submission?.voided)
}

export function activeSubmissions(submissions = []) {
  return submissions.filter((submission) => !isSubmissionVoided(submission))
}

export function describeVoid(voided) {
  if (!voided) return ''
  const reason = voided.reason === 'Outro' && voided.note ? voided.note : voided.reason
  return voided.note && voided.reason !== 'Outro' ? `${reason}: ${voided.note}` : reason
}

function sameExam(first, second) {
  return first.assessmentId === second.assessmentId && first.studentId === second.studentId
}

// Anula todas as folhas do aluno nesse simulado, para que uma leitura antiga
// repetida não continue valendo no lugar da anulada.
export function voidSubmission(submissions, target, { reason, note = '', at = new Date().toISOString() }) {
  const voided = { reason: String(reason || '').trim() || 'Outro', note: String(note || '').trim(), at }
  return submissions.map((submission) => sameExam(submission, target) ? { ...submission, voided } : submission)
}

export function restoreVoidedSubmission(submissions, target, at = new Date().toISOString()) {
  return submissions.map((submission) => {
    if (!sameExam(submission, target) || !submission.voided) return submission
    const { voided, ...restored } = submission
    return { ...restored, voidHistory: [...(submission.voidHistory || []), { ...voided, restoredAt: at }] }
  })
}

// Uma nova leitura da mesma prova herda a anulação, para não liberar a nota sem querer.
export function inheritVoid(newSubmission, previousSubmissions = []) {
  const previous = previousSubmissions.find((item) => sameExam(item, newSubmission) && item.voided)
  return previous ? { ...newSubmission, voided: previous.voided, voidHistory: previous.voidHistory } : newSubmission
}

// Dados antigos não têm o campo; registros malformados (backup editado à mão) são descartados.
export function normalizeSubmissionVoid(submission) {
  if (!submission || !('voided' in submission)) return submission
  const { voided, ...rest } = submission
  if (!voided || typeof voided !== 'object') return rest
  return { ...rest, voided: { reason: String(voided.reason || 'Outro'), note: String(voided.note || ''), at: voided.at || null } }
}
