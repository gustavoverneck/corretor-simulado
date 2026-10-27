// Situação de cada aluno em um simulado: folha corrigida, ausente (marcado pelo professor) ou pendente.
export function getAbsentStudentIds(assessment) {
  return Array.isArray(assessment?.absentStudentIds) ? assessment.absentStudentIds : []
}

export function getAttendance(assessment, students = [], submissions = [], classId = 'all') {
  if (!assessment) return { rows: [], corrected: 0, absent: 0, pending: 0, total: 0 }
  const classIds = classId === 'all' ? assessment.classIds || [] : [classId]
  const submitted = new Set(submissions.filter((submission) => submission.assessmentId === assessment.id).map((submission) => submission.studentId))
  const absent = new Set(getAbsentStudentIds(assessment))
  const rows = students
    .filter((student) => classIds.includes(student.classId) && (student.status === 'Ativo' || submitted.has(student.id)))
    .map((student) => ({ student, status: submitted.has(student.id) ? 'corrected' : absent.has(student.id) ? 'absent' : 'pending' }))
    .sort((a, b) => a.student.name.localeCompare(b.student.name, 'pt-BR'))
  const count = (status) => rows.filter((row) => row.status === status).length
  return { rows, corrected: count('corrected'), absent: count('absent'), pending: count('pending'), total: rows.length }
}

export function setStudentsAbsent(assessment, studentIds, absent) {
  const current = new Set(getAbsentStudentIds(assessment))
  studentIds.forEach((id) => { if (absent) current.add(id); else current.delete(id) })
  return { ...assessment, absentStudentIds: [...current] }
}
