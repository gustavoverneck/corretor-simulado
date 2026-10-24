import assert from 'node:assert/strict'
import { getAttendance, setStudentsAbsent } from '../src/lib/attendance.js'

const students = [
  { id: 's1', name: 'Bruna', classId: 'c1', status: 'Ativo' },
  { id: 's2', name: 'Ana', classId: 'c1', status: 'Ativo' },
  { id: 's3', name: 'Caio', classId: 'c1', status: 'Ativo' },
  { id: 's4', name: 'Davi', classId: 'c2', status: 'Ativo' },
  { id: 's5', name: 'Elis', classId: 'c1', status: 'Inativo' },
  { id: 's6', name: 'Fábio', classId: 'c1', status: 'Inativo' },
]
const submissions = [{ assessmentId: 'a1', studentId: 's1' }, { assessmentId: 'a1', studentId: 's6' }, { assessmentId: 'a2', studentId: 's3' }]
let assessment = { id: 'a1', classIds: ['c1', 'c2'] }

let attendance = getAttendance(assessment, students, submissions)
assert.deepEqual([attendance.corrected, attendance.absent, attendance.pending, attendance.total], [2, 0, 3, 5])
assert.deepEqual(attendance.rows.map((row) => row.student.name), ['Ana', 'Bruna', 'Caio', 'Davi', 'Fábio'], 'inativo com folha corrigida continua na lista')

assessment = setStudentsAbsent(assessment, ['s2', 's1'], true)
attendance = getAttendance(assessment, students, submissions, 'c1')
assert.equal(attendance.rows.find((row) => row.student.id === 's1').status, 'corrected', 'folha corrigida prevalece sobre ausência')
assert.equal(attendance.rows.find((row) => row.student.id === 's2').status, 'absent')
assert.equal(attendance.rows.find((row) => row.student.id === 's3').status, 'pending', 'folha de outro simulado não conta')
assert.equal(attendance.rows.some((row) => row.student.id === 's5'), false, 'inativo sem folha fica fora da lista')

assessment = setStudentsAbsent(assessment, ['s2'], false)
assert.deepEqual(assessment.absentStudentIds, ['s1'])
console.log('attendance: ok')
