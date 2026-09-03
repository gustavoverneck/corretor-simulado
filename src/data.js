export const initialClasses = [
  { id: 'class-9a', name: '9º A', grade: '9º ano', shift: 'Matutino', year: 2026, color: '#4d7c6f' },
  { id: 'class-9b', name: '9º B', grade: '9º ano', shift: 'Matutino', year: 2026, color: '#748b5f' },
  { id: 'class-1a', name: '1ª A', grade: '1ª série EM', shift: 'Vespertino', year: 2026, color: '#b98558' },
  { id: 'class-2a', name: '2ª A', grade: '2ª série EM', shift: 'Vespertino', year: 2026, color: '#796e91' },
  { id: 'class-3a', name: '3ª A', grade: '3ª série EM', shift: 'Noturno', year: 2026, color: '#56758d' },
]

function makeStudents() {
  const totals = [31, 29, 30, 28, 24]
  let cursor = 0
  return initialClasses.flatMap((classroom, classIndex) =>
    Array.from({ length: totals[classIndex] }, () => {
      cursor += 1
      return {
        id: `student-${String(cursor).padStart(3, '0')}`,
        registration: `DEMO-2026-${String(cursor).padStart(4, '0')}`,
        name: `Estudante Fictício ${String(cursor).padStart(3, '0')}`,
        classId: classroom.id,
        status: cursor % 29 === 0 ? 'Transferido' : 'Ativo',
        source: 'SEGES',
        updatedAt: '2026-08-01T13:40:00.000Z',
      }
    }),
  )
}

const answerKeys = {
  saeb: Array.from({ length: 40 }, (_, index) => ['A', 'B', 'C', 'D'][((index * 3) + Math.floor(index / 4)) % 4]),
  diagnostico: Array.from({ length: 30 }, (_, index) => ['A', 'B', 'C', 'D', 'E'][(index * 2 + 1) % 5]),
  revisao: Array.from({ length: 20 }, (_, index) => ['A', 'B', 'C', 'D'][index % 4]),
}

function alternateKey(key, optionCount, offset = 1) {
  return key.map((answer, index) => {
    if (index % 5 !== 0) return answer
    return String.fromCharCode(65 + ((answer.charCodeAt(0) - 65 + offset) % optionCount))
  })
}

export const initialAssessments = [
  {
    id: 'assessment-saeb',
    title: 'Simulado Demonstrativo · Linguagens e Matemática',
    code: 'DEMO-LM-40',
    subjects: ['Língua Portuguesa', 'Matemática'],
    classIds: ['class-9a', 'class-9b'],
    questionCount: 40,
    optionCount: 4,
    questionAreas: Array.from({ length: 40 }, (_, index) => index < 20 ? 'Língua Portuguesa' : 'Matemática'),
    answerKey: answerKeys.saeb,
    answerKeysByClass: {
      'class-9a': answerKeys.saeb,
      'class-9b': alternateKey(answerKeys.saeb, 4),
    },
    date: '2026-08-12',
    status: 'Pronto para aplicar',
    createdAt: '2026-07-28T10:00:00.000Z',
  },
  {
    id: 'assessment-diagnostico',
    title: 'Avaliação Fictícia · Ciências da Natureza',
    code: 'DEMO-CN-30',
    subjects: ['Ciências da Natureza'],
    classIds: ['class-1a', 'class-2a'],
    questionCount: 30,
    optionCount: 5,
    questionAreas: Array.from({ length: 30 }, (_, index) => index < 10 ? 'Biologia' : index < 20 ? 'Física' : 'Química'),
    answerKey: answerKeys.diagnostico,
    answerKeysByClass: {
      'class-1a': answerKeys.diagnostico,
      'class-2a': alternateKey(answerKeys.diagnostico, 5),
    },
    date: '2026-07-29',
    status: 'Correção em andamento',
    createdAt: '2026-07-20T10:00:00.000Z',
  },
  {
    id: 'assessment-revisao',
    title: 'Exercício Demonstrativo · Linguagens',
    code: 'DEMO-LIN-20',
    subjects: ['Linguagens'],
    classIds: ['class-3a'],
    questionCount: 20,
    optionCount: 4,
    questionAreas: Array.from({ length: 20 }, (_, index) => index < 8 ? 'Língua Portuguesa' : index < 14 ? 'Literatura' : 'Língua Inglesa'),
    answerKey: answerKeys.revisao,
    answerKeysByClass: { 'class-3a': answerKeys.revisao },
    date: '2026-07-18',
    status: 'Finalizado',
    createdAt: '2026-07-10T10:00:00.000Z',
  },
]

function makeSubmissions(students) {
  const diagnosticStudents = students.filter((student) => ['class-1a', 'class-2a'].includes(student.classId))
  const reviewStudents = students.filter((student) => student.classId === 'class-3a')
  const makeAnswers = (key, optionCount, correctCount, blankCount, multipleCount) => key.map((expected, questionIndex) => {
    if (questionIndex < correctCount) return { question: questionIndex + 1, selected: [expected], expected, status: 'correct', scores: [] }
    if (questionIndex < correctCount + blankCount) return { question: questionIndex + 1, selected: [], expected, status: 'blank', scores: [] }
    const wrong = String.fromCharCode(65 + ((expected.charCodeAt(0) - 65 + 1) % optionCount))
    if (questionIndex < correctCount + blankCount + multipleCount) return { question: questionIndex + 1, selected: [expected, wrong], expected, status: 'multiple', scores: [] }
    return { question: questionIndex + 1, selected: [wrong], expected, status: 'wrong', scores: [] }
  })
  const diagnostic = diagnosticStudents.slice(0, 42).map((student, index) => {
    const correct = 18 + (index * 7) % 12
    const blank = index % 4
    const multiple = index < 3 ? 1 : 0
    const key = student.classId === 'class-2a' ? initialAssessments[1].answerKeysByClass['class-2a'] : answerKeys.diagnostico
    return {
      id: `submission-diag-${index}`, assessmentId: 'assessment-diagnostico', studentId: student.id, classId: student.classId,
      status: index < 3 ? 'Revisar' : 'Corrigido', correct, wrong: 30 - correct - blank - multiple,
      blank, multiple, uncertain: 0, score: Math.round((correct / 30) * 100),
      answers: makeAnswers(key, 5, correct, blank, multiple), answerKeySnapshot: key,
      confidence: 91 + (index % 7), correctedAt: `2026-08-0${1 + (index % 3)}T14:20:00.000Z`,
    }
  })
  const review = reviewStudents.slice(0, 21).map((student, index) => {
    const correct = 11 + (index * 5) % 9
    const blank = index % 2
    return {
      id: `submission-review-${index}`, assessmentId: 'assessment-revisao', studentId: student.id, classId: student.classId,
      status: 'Corrigido', correct, wrong: 20 - correct - blank, blank, multiple: 0, uncertain: 0,
      score: Math.round((correct / 20) * 100), answers: makeAnswers(answerKeys.revisao, 4, correct, blank, 0),
      answerKeySnapshot: answerKeys.revisao, confidence: 96, correctedAt: '2026-07-18T19:30:00.000Z',
    }
  })
  return [...diagnostic, ...review]
}

export function createInitialState() {
  const students = makeStudents()
  return {
    version: 1,
    school: {
      id: 'school-1',
      name: 'Escola Fictícia de Demonstração',
      inep: '00000000',
      address: 'Rua Exemplo, 000',
      postalCode: '00000-000',
      city: 'Município Fictício',
      state: 'XX',
    },
    classes: initialClasses,
    students,
    assessments: initialAssessments,
    submissions: makeSubmissions(students),
    settings: {
      omr: { markThreshold: 0.38, ambiguityThreshold: 0.22 },
    },
    importHistory: [
      {
        id: 'import-001',
        filename: 'alunos-ficticios-2026.xlsx',
        createdAt: '2026-08-01T13:40:00.000Z',
        added: 142,
        updated: 0,
        skipped: 0,
        source: 'SEGES',
      },
    ],
  }
}

export const classColors = ['#4d7c6f', '#748b5f', '#b98558', '#796e91', '#56758d', '#a56565']
