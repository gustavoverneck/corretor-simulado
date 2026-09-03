import readXlsxFile from 'read-excel-file/browser'
import { classColors } from '../data.js'
import { nextStudentRegistration, normalize, uid } from './utils.js'

export const fieldDefinitions = [
  { key: 'registration', label: 'Matrícula / ID', required: false, aliases: ['matricula', 'matricula aluno', 'id aluno', 'codigo aluno', 'cod aluno', 'inep aluno', 'codigo'] },
  { key: 'name', label: 'Nome do aluno', required: true, aliases: ['nome', 'aluno', 'nome aluno', 'nome civil', 'nome estudante', 'estudante'] },
  { key: 'className', label: 'Turma', required: true, aliases: ['turma', 'classe', 'nome turma', 'nome da turma', 'descricao turma'] },
  { key: 'grade', label: 'Série / etapa', required: false, aliases: ['serie', 'ano', 'etapa', 'ano serie', 'etapa modalidade', 'serie ano'] },
  { key: 'shift', label: 'Turno', required: false, aliases: ['turno', 'periodo', 'horario'] },
  { key: 'status', label: 'Situação', required: true, aliases: ['situacao', 'status', 'situacao matricula', 'status aluno'] },
  { key: 'school', label: 'Escola', required: false, aliases: ['escola', 'nome escola', 'unidade escolar'] },
  { key: 'schoolInep', label: 'INEP da escola', required: false, aliases: ['inep escola', 'codigo inep escola', 'cod escola'] },
]

export const mappingSources = {
  gradeFromClass: '__grade_from_class__',
  manualShift: '__manual_shift__',
  settingsSchool: '__settings_school__',
  settingsInep: '__settings_inep__',
}

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

export function readPastedTable(source) {
  const lines = String(source ?? '')
    .replace(/^\ufeff/, '')
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.trim())
  if (!lines.length) return { rows: [], headers: [], sheetName: 'Área de transferência', rowOffset: 1 }

  const matrix = lines.map((line) => line.split('\t').map((cell) => cell.trim()))
  const columnCount = Math.max(...matrix.map((row) => row.length))
  const headerTerms = new Set([
    'nome', 'nome completo', 'nome do aluno', 'nome aluno', 'aluno', 'estudante',
    'matricula', 'matricula aluno', 'codigo', 'turma', 'serie', 'turno',
  ])
  const hasHeader = matrix[0].some((cell) => headerTerms.has(normalize(cell)))
  const headerRow = hasHeader ? matrix[0] : Array.from({ length: columnCount }, (_, index) => `Coluna ${index + 1}`)
  const usedHeaders = new Map()
  const headers = Array.from({ length: columnCount }, (_, index) => {
    const base = String(headerRow[index] || `Coluna ${index + 1}`).trim()
    const count = (usedHeaders.get(base) || 0) + 1
    usedHeaders.set(base, count)
    return count === 1 ? base : `${base} (${count})`
  })
  const dataRows = hasHeader ? matrix.slice(1) : matrix
  const rows = dataRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))

  return { rows, headers, sheetName: 'Área de transferência', rowOffset: hasHeader ? 2 : 1 }
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
  if (!mapping.grade && mapping.className) mapping.grade = mappingSources.gradeFromClass
  if (!mapping.shift) mapping.shift = mappingSources.manualShift
  if (!mapping.school) mapping.school = mappingSources.settingsSchool
  if (!mapping.schoolInep) mapping.schoolInep = mappingSources.settingsInep
  return mapping
}

export function validateMapping(mapping, options = {}) {
  const missing = fieldDefinitions
    .filter((field) => field.required && !mapping[field.key])
    .map((field) => field.label)
  if (mapping.shift === mappingSources.manualShift && !String(options.manualShift ?? '').trim()) {
    missing.push('Turno (valor manual)')
  }
  return missing
}

function mapped(row, mapping, key) {
  return String(row[mapping[key]] ?? '').trim()
}

export function gradeFromClassName(className) {
  const firstDigit = String(className ?? '').match(/\d/)?.[0]
  return ['1', '2', '3'].includes(firstDigit) ? `${firstDigit}ª série` : ''
}

export function resolveSegesValue(row, mapping, key, options = {}) {
  let value = ''
  if (key === 'grade' && mapping[key] === mappingSources.gradeFromClass) {
    value = gradeFromClassName(mapped(row, mapping, 'className'))
  } else if (key === 'shift' && mapping[key] === mappingSources.manualShift) {
    value = options.manualShift
  } else if (key === 'school' && mapping[key] === mappingSources.settingsSchool) {
    value = options.school?.name
  } else if (key === 'schoolInep' && mapping[key] === mappingSources.settingsInep) {
    value = options.school?.inep
  } else {
    value = mapped(row, mapping, key)
  }
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function isSegesStatusEligible(status) {
  return ['sem status', 'em transferencia'].includes(normalize(status))
}

export function isSegesAuxiliaryRow(row) {
  return Object.values(row).some((value) => normalize(value) === 'lancar para todos')
}

export function isSegesRowEligible(row, mapping, options = {}) {
  if (isSegesAuxiliaryRow(row)) return false
  if (mapping.status && !isSegesStatusEligible(resolveSegesValue(row, mapping, 'status', options))) return false
  return Boolean(
    resolveSegesValue(row, mapping, 'name', options)
    && resolveSegesValue(row, mapping, 'className', options),
  )
}

export function importSegesRows(state, rows, mapping, filename, options = {}) {
  const classes = [...state.classes]
  const students = [...state.students]
  const knownStudents = new Map(students.map((student, index) => [normalize(student.registration), index]))
  const knownStudentsByClassAndName = new Map(students.map((student, index) => [normalize(`${student.classId}|${student.name}`), index]))
  const knownClasses = new Map(classes.map((item) => [normalize(`${item.name}|${item.grade}|${item.shift}`), item]))
  let added = 0
  let updated = 0
  let skipped = 0
  const errors = []

  rows.forEach((row, rowIndex) => {
    const resolverOptions = { ...options, school: state.school }
    if (isSegesAuxiliaryRow(row)) {
      skipped += 1
      errors.push(`Linha ${rowIndex + 2}: linha auxiliar “LANÇAR PARA TODOS” ignorada.`)
      return
    }
    const importedStatus = resolveSegesValue(row, mapping, 'status', resolverOptions)
    if (mapping.status && !isSegesStatusEligible(importedStatus)) {
      skipped += 1
      errors.push(`Linha ${rowIndex + 2}: situação “${importedStatus || 'vazia'}” ignorada.`)
      return
    }

    const providedRegistration = resolveSegesValue(row, mapping, 'registration', resolverOptions)
    const name = resolveSegesValue(row, mapping, 'name', resolverOptions)
    const className = resolveSegesValue(row, mapping, 'className', resolverOptions)
    const grade = resolveSegesValue(row, mapping, 'grade', resolverOptions) || 'Não informada'
    const shift = resolveSegesValue(row, mapping, 'shift', resolverOptions) || 'Não informado'
    if (!name || !className) {
      skipped += 1
      errors.push(`Linha ${rowIndex + 2}: nome ou turma ausente.`)
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

    const nameKey = normalize(`${classroom.id}|${name}`)
    const existingIndex = providedRegistration
      ? knownStudents.get(normalize(providedRegistration))
      : knownStudentsByClassAndName.get(nameKey)
    const registration = providedRegistration || students[existingIndex]?.registration || nextStudentRegistration(students)
    const studentKey = normalize(registration)
    const sourceData = {
      registration,
      registrationType: providedRegistration ? 'external' : students[existingIndex]?.registrationType || 'internal',
      name,
      classId: classroom.id,
      status: 'Ativo',
      sourceStatus: importedStatus || undefined,
      source: 'SEGES',
      updatedAt: new Date().toISOString(),
    }
    if (existingIndex !== undefined) {
      students[existingIndex] = { ...students[existingIndex], ...sourceData }
      knownStudents.set(studentKey, existingIndex)
      knownStudentsByClassAndName.set(nameKey, existingIndex)
      updated += 1
    } else {
      students.push({ id: uid('student'), ...sourceData })
      knownStudents.set(studentKey, students.length - 1)
      knownStudentsByClassAndName.set(nameKey, students.length - 1)
      added += 1
    }
  })

  const historyEntry = {
    id: uid('import'), filename, createdAt: new Date().toISOString(), added, updated, skipped, source: 'SEGES',
    school: resolveSegesValue(rows[0] || {}, mapping, 'school', { ...options, school: state.school }) || state.school?.name,
    schoolInep: resolveSegesValue(rows[0] || {}, mapping, 'schoolInep', { ...options, school: state.school }) || state.school?.inep,
  }
  return {
    state: { ...state, classes, students, importHistory: [historyEntry, ...state.importHistory] },
    summary: { added, updated, skipped, errors },
  }
}

export function sampleCsv() {
  const rows = [
    ['Número', 'Nome do aluno', 'Status', 'Nome da turma', 'Data e hora da captura'],
    ['1', 'Estudante Fictício 001', 'Sem status', '2ªIV01-EMI-LOG', '2026-08-25T19:13:52.389Z'],
    ['2', 'Estudante Fictício 002', 'Transferido', '2ªIV01-EMI-LOG', '2026-08-25T19:13:52.390Z'],
  ]
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\n')
}
