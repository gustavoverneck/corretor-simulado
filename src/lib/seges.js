import readXlsxFile from 'read-excel-file/browser'
import { classColors } from '../data.js'
import { normalize, uid } from './utils.js'

export const fieldDefinitions = [
  { key: 'registration', label: 'Matrícula / ID', required: true, aliases: ['matricula', 'matricula aluno', 'id aluno', 'codigo aluno', 'cod aluno', 'inep aluno', 'codigo'] },
  { key: 'name', label: 'Nome do aluno', required: true, aliases: ['nome', 'aluno', 'nome aluno', 'nome civil', 'nome estudante', 'estudante'] },
  { key: 'className', label: 'Turma', required: true, aliases: ['turma', 'classe', 'nome turma', 'descricao turma'] },
  { key: 'grade', label: 'Série / etapa', required: false, aliases: ['serie', 'ano', 'etapa', 'ano serie', 'etapa modalidade', 'serie ano'] },
  { key: 'shift', label: 'Turno', required: false, aliases: ['turno', 'periodo', 'horario'] },
  { key: 'status', label: 'Situação', required: false, aliases: ['situacao', 'status', 'situacao matricula', 'status aluno'] },
  { key: 'school', label: 'Escola', required: false, aliases: ['escola', 'nome escola', 'unidade escolar'] },
  { key: 'schoolInep', label: 'INEP da escola', required: false, aliases: ['inep escola', 'codigo inep escola', 'cod escola'] },
]

export async function readSegesFile(file) {
  if (/\.csv$/i.test(file.name)) {
    const matrix = parseCsv(await file.text())
    const [headerRow = [], ...dataRows] = matrix.filter((row) => row.some((cell) => String(cell).trim()))
    const headers = headerRow.map((cell, index) => String(cell || `Coluna ${index + 1}`).trim())
    const rows = dataRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
    return { rows, headers, sheetName: 'CSV' }
  }
  const matrix = await readXlsxFile(file)
  const [headerRow = [], ...dataRows] = matrix.filter((row) => row.some((cell) => String(cell ?? '').trim()))
  const headers = headerRow.map((cell, index) => String(cell || `Coluna ${index + 1}`).trim())
  const rows = dataRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
  return { rows, headers, sheetName: 'Planilha 1' }
}

function parseCsv(source) {
  const text = String(source).replace(/^\ufeff/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  const delimiter = [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]
  const rows = []
  let row = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1 }
      else quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(value.trim()); value = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(value.trim()); value = ''
      rows.push(row); row = []
    } else value += char
  }
  if (value || row.length) { row.push(value.trim()); rows.push(row) }
  return rows
}

export function autoMapHeaders(headers) {
  const mapping = {}
  fieldDefinitions.forEach((field) => {
    const aliasSet = [field.label, ...field.aliases].map(normalize)
    const exact = headers.find((header) => aliasSet.includes(normalize(header)))
    const partial = headers.find((header) => aliasSet.some((alias) => normalize(header).includes(alias) || alias.includes(normalize(header))))
    mapping[field.key] = exact || partial || ''
  })
  return mapping
}

export function validateMapping(mapping) {
  return fieldDefinitions
    .filter((field) => field.required && !mapping[field.key])
    .map((field) => field.label)
}

function mapped(row, mapping, key) {
  return String(row[mapping[key]] ?? '').trim()
}

export function importSegesRows(state, rows, mapping, filename) {
  const classes = [...state.classes]
  const students = [...state.students]
  const knownStudents = new Map(students.map((student, index) => [normalize(student.registration), index]))
  const knownClasses = new Map(classes.map((item) => [normalize(`${item.name}|${item.grade}|${item.shift}`), item]))
  let added = 0
  let updated = 0
  let skipped = 0
  const errors = []

  rows.forEach((row, rowIndex) => {
    const registration = mapped(row, mapping, 'registration')
    const name = mapped(row, mapping, 'name')
    const className = mapped(row, mapping, 'className')
    const grade = mapped(row, mapping, 'grade') || 'Não informada'
    const shift = mapped(row, mapping, 'shift') || 'Não informado'
    if (!registration || !name || !className) {
      skipped += 1
      errors.push(`Linha ${rowIndex + 2}: matrícula, nome ou turma ausente.`)
      return
    }

    const classKey = normalize(`${className}|${grade}|${shift}`)
    let classroom = knownClasses.get(classKey)
    if (!classroom) {
      classroom = {
        id: uid('class'), name: className, grade, shift, year: new Date().getFullYear(),
        color: classColors[classes.length % classColors.length],
      }
      classes.push(classroom)
      knownClasses.set(classKey, classroom)
    }

    const studentKey = normalize(registration)
    const existingIndex = knownStudents.get(studentKey)
    const sourceData = {
      registration,
      name,
      classId: classroom.id,
      status: mapped(row, mapping, 'status') || 'Ativo',
      source: 'SEGES',
      updatedAt: new Date().toISOString(),
    }
    if (existingIndex !== undefined) {
      students[existingIndex] = { ...students[existingIndex], ...sourceData }
      updated += 1
    } else {
      students.push({ id: uid('student'), ...sourceData })
      knownStudents.set(studentKey, students.length - 1)
      added += 1
    }
  })

  const historyEntry = {
    id: uid('import'), filename, createdAt: new Date().toISOString(), added, updated, skipped, source: 'SEGES',
  }
  return {
    state: { ...state, classes, students, importHistory: [historyEntry, ...state.importHistory] },
    summary: { added, updated, skipped, errors },
  }
}

export function sampleCsv() {
  const rows = [
    ['Matrícula', 'Nome do Aluno', 'Turma', 'Série', 'Turno', 'Situação', 'Escola', 'INEP Escola'],
    ['20260012345', 'Maria da Silva Santos', '9º A', '9º ano', 'Matutino', 'Ativo', 'EEEFM Exemplo', '32000001'],
    ['20260012346', 'João Pereira Souza', '9º A', '9º ano', 'Matutino', 'Ativo', 'EEEFM Exemplo', '32000001'],
  ]
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\n')
}
