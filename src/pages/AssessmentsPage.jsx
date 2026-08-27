import { useMemo, useState } from 'react'
import { Plus, Search, ClipboardList, CalendarDays, UsersRound, Printer, ScanLine, CheckCircle2, Eye, FileText, Trash2, AlertTriangle, Layers3, X, Shuffle, UserPlus, PencilLine, Ban, CircleOff, Download, FileSpreadsheet, LockKeyhole, RotateCcw, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Modal } from '../components/ui'
import { PrintableSheets } from '../components/AnswerSheet'
import { CANCELLED_ANSWER, closeAssessment, createRandomAnswerKey, getAssessmentStatusLabel, getAnswerKeyForClass, getAnswerKeyVersionForStudent, getAnswerKeyVersions, getAnswerKeyVersionsForClass, getPendingReviewSubmissions, hasCustomAnswerKey, isAssessmentClosed, regradeAnswers, reopenAssessment, updateAnswerKeyVersionForClass } from '../lib/assessment'
import { getQuestionAreas, QUESTION_AREA_SUGGESTIONS, uniqueQuestionAreas } from '../lib/knowledgeAreas'
import { CURRENT_MARKER_LAYOUT, getAnswerSheetLayout } from '../lib/omr'
import { buildSegesResultRows, calculateAssessmentResult, formatSegesGrade, SEGES_RESULT_STATUS, segesResultsFilename, serializeSegesResultsCsv, indexAssessmentSubmissions } from '../lib/segesResults'
import { average, cn, downloadBlob, formatDate, initials, uid } from '../lib/utils'

const subjectOptions = ['Língua Portuguesa', 'Matemática', 'Ciências da Natureza', 'Ciências Humanas', 'Linguagens']

function initialAnswerKeyVersions() {
  return [{ id: 'version-a', label: 'Versão A', answerKey: Array(90).fill(''), classIds: [] }]
}

function answerKeyVersionColor(assessment, versionId) {
  const versionIndex = Math.max(0, getAnswerKeyVersions(assessment).findIndex((version) => version.id === versionId))
  const hue = Math.round((154 + versionIndex * 137.508) % 360)
  return {
    color: `hsl(${hue} 30% 34%)`,
    backgroundColor: `hsl(${hue} 42% 94%)`,
    borderColor: `hsl(${hue} 28% 78%)`,
  }
}

function AssessmentDetails({ assessment, data, setData, notify }) {
  const [studentClassFilter, setStudentClassFilter] = useState('all')
  const [exportOpen, setExportOpen] = useState(false)
  const [exportClassIds, setExportClassIds] = useState(assessment.classIds)
  const [exportScope, setExportScope] = useState('all')
  const [exportMaxGrade, setExportMaxGrade] = useState('10')
  const [editingAreas, setEditingAreas] = useState(false)
  const [areaDraft, setAreaDraft] = useState(() => getQuestionAreas(assessment))
  const [bulkAreaDraft, setBulkAreaDraft] = useState('')
  const [editingAnswer, setEditingAnswer] = useState(null)
  const [studentSort, setStudentSort] = useState({ key: 'name', direction: 'asc' })
  const submissions = data.submissions.filter((item) => item.assessmentId === assessment.id)
  const closed = isAssessmentClosed(assessment)
  const totalStudents = data.students.filter((student) => assessment.classIds.includes(student.classId) && student.status === 'Ativo').length
  const progress = totalStudents ? Math.min(100, Math.round((submissions.length / totalStudents) * 100)) : 0
  const pendingReviews = closed ? 0 : submissions.filter((item) => item.status === 'Revisar').length
  const areaCount = uniqueQuestionAreas(assessment).length
  const questionAreas = getQuestionAreas(assessment)
  const areaSummary = [...questionAreas.reduce((summary, area) => summary.set(area, (summary.get(area) || 0) + 1), new Map()).entries()]
  const submissionsByStudent = useMemo(
    () => indexAssessmentSubmissions(data.submissions, assessment.id),
    [assessment.id, data.submissions],
  )
  const parsedExportMaxGrade = Number(String(exportMaxGrade).replace(',', '.'))
  const validExportMaxGrade = Number.isFinite(parsedExportMaxGrade) && parsedExportMaxGrade > 0 && parsedExportMaxGrade <= 100
  const exportRows = useMemo(() => buildSegesResultRows({
    assessment,
    classes: data.classes,
    students: data.students,
    submissions: data.submissions,
    classIds: exportClassIds,
    scope: exportScope,
    maxGrade: validExportMaxGrade ? parsedExportMaxGrade : 10,
  }), [assessment, data.classes, data.students, data.submissions, exportClassIds, exportScope, parsedExportMaxGrade, validExportMaxGrade])
  const exportSummary = exportRows.reduce((summary, row) => {
    summary[row.status] = (summary[row.status] || 0) + 1
    return summary
  }, {})
  const declaredAreaOptions = [...new Set([
    ...QUESTION_AREA_SUGGESTIONS,
    ...data.assessments.flatMap((item) => getQuestionAreas(item)),
  ])].filter(Boolean)
  const statusTone = closed ? 'neutral' : assessment.status.includes('andamento') ? 'ochre' : 'green'
  const versionedStudents = data.students
    .filter((student) => assessment.classIds.includes(student.classId) && student.status === 'Ativo')
    .filter((student) => studentClassFilter === 'all' || student.classId === studentClassFilter)
  const studentRows = versionedStudents.map((student) => {
    const classroom = data.classes.find((item) => item.id === student.classId)
    const version = getAnswerKeyVersionForStudent(assessment, student)
    const allowedVersions = getAnswerKeyVersionsForClass(assessment, student.classId)
    const submission = submissionsByStudent.get(student.id)
    const result = calculateAssessmentResult(submission, assessment, 'all', 10)
    const resultTone = !submission || (closed && submission.status === 'Revisar') ? 'neutral' : submission.status === 'Revisar' ? 'ochre' : 'green'
    const resultLabel = !submission ? closed ? 'Não participou' : 'Sem correção' : submission.status === 'Revisar' ? closed ? 'Encerrado com ressalva' : 'Revisar' : 'Corrigido'
    return {
      student,
      classroom,
      version,
      allowedVersions,
      selectableVersions: allowedVersions.length ? allowedVersions : version ? [version] : [],
      result,
      resultTone,
      resultLabel,
    }
  })
  const sortedStudentRows = [...studentRows].sort((first, second) => {
    const nameComparison = first.student.name.localeCompare(second.student.name, 'pt-BR', { sensitivity: 'base' })
    if (studentSort.key === 'grade' && Boolean(first.result) !== Boolean(second.result)) return first.result ? -1 : 1
    let comparison = nameComparison
    if (studentSort.key === 'class') comparison = String(first.classroom?.name || '').localeCompare(String(second.classroom?.name || ''), 'pt-BR', { sensitivity: 'base' })
    if (studentSort.key === 'grade') comparison = Number(first.result?.grade || 0) - Number(second.result?.grade || 0)
    if (studentSort.key === 'status') comparison = first.resultLabel.localeCompare(second.resultLabel, 'pt-BR', { sensitivity: 'base' })
    if (studentSort.key === 'version') comparison = String(first.version?.label || '').localeCompare(String(second.version?.label || ''), 'pt-BR', { sensitivity: 'base' })
    return (studentSort.direction === 'asc' ? comparison : -comparison) || nameComparison
  })

  function changeStudentSort(key) {
    setStudentSort((current) => current.key === key
      ? { ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: key === 'grade' ? 'desc' : 'asc' })
  }

  function sortableStudentHeader(key, label) {
    const active = studentSort.key === key
    const SortIcon = !active ? ArrowUpDown : studentSort.direction === 'asc' ? ArrowUp : ArrowDown
    const nextDirection = active
      ? studentSort.direction === 'asc' ? 'decrescente' : 'crescente'
      : key === 'grade' ? 'decrescente' : 'crescente'
    return (
      <th className={cn('sortable-column', active && 'is-sorted')} aria-sort={active ? studentSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
        <button type="button" onClick={() => changeStudentSort(key)} title={`Ordenar ${label.toLowerCase()} em ordem ${nextDirection}`}>
          <span>{label}</span><SortIcon size={13} />
        </button>
      </th>
    )
  }

  function changeStudentVersion(student, versionId) {
    const allowedVersions = getAnswerKeyVersionsForClass(assessment, student.classId)
    const selectedVersion = allowedVersions.find((version) => version.id === versionId)
    if (!selectedVersion) return

    setData((current) => ({
      ...current,
      assessments: current.assessments.map((item) => item.id === assessment.id ? {
        ...item,
        answerKeyVersionIdByStudent: {
          ...item.answerKeyVersionIdByStudent,
          [student.id]: selectedVersion.id,
        },
      } : item),
    }))
    notify('Versão alterada', `${student.name} agora está com ${selectedVersion.label}.`)
  }

  function openResultExport() {
    setExportClassIds([...assessment.classIds])
    setExportScope('all')
    setExportMaxGrade('10')
    setExportOpen(true)
  }

  function toggleExportClass(classId) {
    setExportClassIds((current) => current.includes(classId)
      ? current.filter((id) => id !== classId)
      : [...current, classId])
  }

  function exportSegesResults() {
    if (!exportClassIds.length) {
      notify('Selecione uma turma', 'Inclua ao menos uma turma no arquivo de notas.', 'warning')
      return
    }
    if (!validExportMaxGrade) {
      notify('Nota máxima inválida', 'Informe um valor maior que zero e menor ou igual a 100.', 'warning')
      return
    }
    const ready = exportRows.filter((row) => row.exportable).length
    if (!ready) {
      notify('Nenhuma nota pronta', 'O recorte selecionado não possui correções prontas para lançamento.', 'warning')
      return
    }

    const csv = serializeSegesResultsCsv(exportRows, {
      assessment,
      exportId: `seges-${Date.now().toString(36)}`,
      scope: exportScope,
      maxGrade: parsedExportMaxGrade,
    })
    downloadBlob(
      new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }),
      segesResultsFilename(assessment, exportScope),
    )
    setExportOpen(false)
    const pending = exportRows.length - ready
    notify(
      'Notas exportadas',
      `${ready} ${ready === 1 ? 'nota pronta' : 'notas prontas'} para o SEGES${pending ? `; ${pending} pendência${pending !== 1 ? 's' : ''} registrada${pending !== 1 ? 's' : ''} no arquivo` : ''}.`,
    )
  }

  function startEditingAreas() {
    setAreaDraft(getQuestionAreas(assessment))
    setBulkAreaDraft('')
    setEditingAreas(true)
  }

  function cancelEditingAreas() {
    setAreaDraft(getQuestionAreas(assessment))
    setBulkAreaDraft('')
    setEditingAreas(false)
  }

  function changeQuestionArea(index, value) {
    setAreaDraft((current) => current.map((area, areaIndex) => areaIndex === index ? value : area))
  }

  function applyDetailAreaToAll() {
    const normalized = bulkAreaDraft.trim()
    if (!normalized) {
      notify('Informe uma área', 'Digite ou selecione a área que será aplicada às questões.', 'warning')
      return
    }
    setAreaDraft((current) => current.map(() => normalized))
  }

  function saveQuestionAreas() {
    const normalizedAreas = areaDraft.slice(0, assessment.questionCount).map((area) => String(area || '').trim())
    if (normalizedAreas.length !== assessment.questionCount || normalizedAreas.some((area) => !area)) {
      notify('Área não definida', 'Informe a área de conhecimento de todas as questões.', 'warning')
      return
    }
    const changedCount = normalizedAreas.filter((area, index) => area !== questionAreas[index]).length
    setData((current) => ({
      ...current,
      assessments: current.assessments.map((item) => item.id === assessment.id ? { ...item, questionAreas: normalizedAreas } : item),
    }))
    setEditingAreas(false)
    setBulkAreaDraft('')
    notify(
      changedCount ? 'Áreas atualizadas' : 'Áreas conferidas',
      changedCount
        ? `${changedCount} ${changedCount === 1 ? 'questão foi reclassificada' : 'questões foram reclassificadas'}. Notas e gabaritos não foram alterados.`
        : 'Nenhuma classificação foi alterada.',
      changedCount ? 'success' : 'info',
    )
  }

  function changeVersionAnswer(classId, version, questionIndex, answer) {
    const explicitVersion = assessment.answerKeyVersions?.some((item) => item.id === version.id)
    const versionSharedWithAnotherClass = explicitVersion && assessment.classIds.some((itemClassId) => (
      itemClassId !== classId && assessment.answerKeyVersionIdsByClass?.[itemClassId]?.includes(version.id)
    ))
    const savedVersionId = versionSharedWithAnotherClass ? uid('version') : version.id
    const previousAnswer = version.answerKey[questionIndex]
    if (previousAnswer === answer) {
      setEditingAnswer(null)
      return
    }

    const affectedSubmissions = data.submissions.filter((submission) => {
      if (submission.assessmentId !== assessment.id || !Array.isArray(submission.answers)) return false
      const student = data.students.find((item) => item.id === submission.studentId)
      if ((submission.classId || student?.classId) !== classId) return false
      if (!explicitVersion) {
        return true
      }
      if (submission.answerKeyVersionId) return submission.answerKeyVersionId === version.id
      return getAnswerKeyVersionForStudent(assessment, student)?.id === version.id
    })

    setData((current) => {
      const currentAssessment = current.assessments.find((item) => item.id === assessment.id)
      if (!currentAssessment) return current
      const storedVersion = currentAssessment.answerKeyVersions?.find((item) => item.id === version.id)
      const currentKey = storedVersion?.answerKey || getAnswerKeyForClass(currentAssessment, classId)
      const nextKey = currentKey.map((value, index) => index === questionIndex ? answer : value)
      const updatedVersion = updateAnswerKeyVersionForClass(currentAssessment, classId, version.id, nextKey, current.students, () => savedVersionId)
      const nextAssessment = updatedVersion.assessment

      return {
        ...current,
        assessments: current.assessments.map((item) => item.id === assessment.id ? nextAssessment : item),
        submissions: current.submissions.map((submission) => {
          if (submission.assessmentId !== assessment.id || !Array.isArray(submission.answers)) return submission
          const student = current.students.find((item) => item.id === submission.studentId)
          const submissionClassId = submission.classId || student?.classId
          const affected = submissionClassId === classId && (storedVersion
            ? submission.answerKeyVersionId
              ? submission.answerKeyVersionId === storedVersion.id
              : getAnswerKeyVersionForStudent(currentAssessment, student)?.id === storedVersion.id
            : true)
          if (!affected) return submission
          const graded = regradeAnswers(submission.answers, nextKey)
          return {
            ...submission,
            ...graded,
            answerKeySnapshot: [...nextKey],
            answerKeyVersionId: storedVersion && updatedVersion.forked ? updatedVersion.versionId : submission.answerKeyVersionId,
            answerKeyVersionLabel: storedVersion ? storedVersion.label : submission.answerKeyVersionLabel,
            status: graded.multiple > 0 || graded.uncertain > 0 ? 'Revisar' : 'Corrigido',
            regradedAt: new Date().toISOString(),
          }
        }),
      }
    })
    setEditingAnswer(null)
    const action = answer === null ? 'anulada' : answer === CANCELLED_ANSWER ? 'cancelada' : `alterada para ${answer}`
    notify(
      answer === null ? 'Questão anulada' : answer === CANCELLED_ANSWER ? 'Questão cancelada' : 'Gabarito atualizado',
      `${version.label} de ${data.classes.find((item) => item.id === classId)?.name || 'turma'}, questão ${questionIndex + 1}: ${action}${affectedSubmissions.length ? `. ${affectedSubmissions.length} ${affectedSubmissions.length === 1 ? 'correção recalculada' : 'correções recalculadas'}` : ''}.`,
    )
  }

  return (
    <div className="assessment-detail">
      <div className="assessment-detail-heading">
        <span className="assessment-detail-icon"><FileText size={23} /></span>
        <div><div><Badge tone={statusTone} dot>{getAssessmentStatusLabel(assessment)}</Badge><em>{assessment.code}</em></div><strong>{assessment.subjects.join(' · ')}</strong><p>Aplicação em {formatDate(assessment.date)} · criado em {formatDate(assessment.createdAt)}{assessment.closedAt ? ` · encerrado em ${formatDate(assessment.closedAt)}` : ''}</p></div>
      </div>

      <div className="assessment-detail-metrics">
        <div><small>QUESTÕES</small><strong>{assessment.questionCount}</strong><span>{areaCount} {areaCount === 1 ? 'área' : 'áreas'} · A–{String.fromCharCode(64 + assessment.optionCount)}</span></div>
        <div><small>ALUNOS</small><strong>{totalStudents}</strong><span>{assessment.classIds.length} {assessment.classIds.length === 1 ? 'turma' : 'turmas'}</span></div>
        <div><small>PROCESSADAS</small><strong>{submissions.length}</strong><span>{progress}% concluído</span></div>
        <div><small>MÉDIA</small><strong>{submissions.length ? `${average(submissions.map((item) => item.score))}%` : '—'}</strong><span>{closed ? 'resultado encerrado' : `${pendingReviews} para revisar`}</span></div>
      </div>

      <div className="assessment-detail-progress"><div><span>{closed ? 'Participação final registrada' : 'Andamento da correção'}</span><strong>{submissions.length} de {totalStudents}</strong></div><div className="wide-progress"><i style={{ width: `${progress}%` }} /></div></div>

      <section className="assessment-detail-areas">
        <header>
          <div><h3>Áreas das questões</h3><p>Classifique cada questão para organizar os filtros e as análises pedagógicas.</p></div>
          {!editingAreas && !closed && <Button variant="secondary" size="sm" icon={PencilLine} onClick={startEditingAreas}>Editar áreas</Button>}
          {closed && <Badge tone="neutral"><LockKeyhole size={12} /> Reabra para editar</Badge>}
        </header>
        <div className="assessment-area-summary">
          {areaSummary.map(([area, count]) => <span key={area}><strong>{area}</strong><small>{count} {count === 1 ? 'questão' : 'questões'}</small></span>)}
        </div>
        {editingAreas && <div className="assessment-area-editing">
          <div className="assessment-area-safety-note"><AlertTriangle size={17} /><p><strong>Alteração segura</strong><span>As respostas, os gabaritos e as notas não mudam. Resultados por área serão reagrupados, inclusive nas {submissions.length} {submissions.length === 1 ? 'correção existente' : 'correções existentes'}.</span></p></div>
          <div className="assessment-area-bulk">
            <Field label="Aplicar uma área a todas"><div className="assessment-area-choice"><input value={bulkAreaDraft} onChange={(event) => setBulkAreaDraft(event.target.value)} placeholder="Digite uma área personalizada" /><select value={declaredAreaOptions.includes(bulkAreaDraft) ? bulkAreaDraft : ''} onChange={(event) => event.target.value && setBulkAreaDraft(event.target.value)} aria-label="Escolher área cadastrada para todas as questões"><option value="">Escolher área cadastrada</option>{declaredAreaOptions.map((area) => <option value={area} key={area}>{area}</option>)}</select></div></Field>
            <Button variant="secondary" size="sm" icon={Layers3} onClick={applyDetailAreaToAll}>Aplicar</Button>
          </div>
          <div className="assessment-area-grid">
            {areaDraft.map((area, index) => <label key={index}><span>Questão {String(index + 1).padStart(2, '0')}</span><div className="assessment-area-choice"><input value={area} onChange={(event) => changeQuestionArea(index, event.target.value)} placeholder="Digite uma área personalizada" /><select value={declaredAreaOptions.includes(area) ? area : ''} onChange={(event) => event.target.value && changeQuestionArea(index, event.target.value)} aria-label={`Escolher área cadastrada para a questão ${index + 1}`}><option value="">Escolher área cadastrada</option>{declaredAreaOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></div></label>)}
          </div>
          <div className="assessment-area-actions"><Button variant="ghost" size="sm" icon={X} onClick={cancelEditingAreas}>Cancelar</Button><Button size="sm" icon={CheckCircle2} onClick={saveQuestionAreas}>Salvar áreas</Button></div>
        </div>}
      </section>

      <section className="assessment-detail-classes">
        <header><h3>Turmas e gabaritos</h3><p>Clique em uma resposta para alterá-la, anulá-la com ponto ou cancelá-la sem entrar na nota daquela versão.</p></header>
        {assessment.classIds.map((classId) => {
          const classroom = data.classes.find((item) => item.id === classId)
          const students = data.students.filter((student) => student.classId === classId && student.status === 'Ativo')
          const studentIds = new Set(students.map((student) => student.id))
          const classSubmissions = submissions.filter((item) => item.classId === classId || studentIds.has(item.studentId))
          const key = getAnswerKeyForClass(assessment, classId)
          const keyVersions = getAnswerKeyVersionsForClass(assessment, classId)
          const isCustom = hasCustomAnswerKey(assessment, classId)
          return (
            <article className="assessment-detail-class" key={classId}>
              <div className="assessment-detail-class-header">
                <span style={{ '--class-color': classroom?.color }}><UsersRound size={18} /></span>
                <div><strong>{classroom?.name || 'Turma removida'}</strong><small>{classroom?.shift} · {students.length} alunos · {classSubmissions.length} corrigidos</small></div>
                <Badge tone={isCustom ? 'purple' : 'green'}>{keyVersions.length > 1 ? `${keyVersions.length} versões` : isCustom ? 'Gabarito específico' : 'Gabarito padrão'}</Badge>
              </div>
              <div className="assessment-detail-key-versions">
                {(keyVersions.length ? keyVersions : [{ id: `class-${classId}`, label: 'Gabarito', answerKey: key }]).map((version) => {
                  const activeQuestion = editingAnswer?.classId === classId && editingAnswer?.versionId === version.id ? editingAnswer.questionIndex : null
                  return <div key={version.id}>
                    <strong>{version.label}</strong>
                    <div className="assessment-detail-key" aria-label={`${version.label} de ${classroom?.name}`}>
                      {version.answerKey.map((answer, index) => <button type="button" key={index} disabled={closed} className={cn(answer === null && 'is-annulled', answer === CANCELLED_ANSWER && 'is-cancelled', activeQuestion === index && 'is-editing')} onClick={() => setEditingAnswer({ classId, versionId: version.id, questionIndex: index })} aria-label={`${closed ? 'Visualizar' : 'Alterar'} questão ${index + 1}, ${answer === null ? 'anulada' : answer === CANCELLED_ANSWER ? 'cancelada' : `gabarito ${answer || 'não definido'}`}`} aria-expanded={activeQuestion === index}><small>{String(index + 1).padStart(2, '0')}</small><strong>{answer === null ? 'ANU' : answer === CANCELLED_ANSWER ? 'CAN' : answer || '—'}</strong></button>)}
                    </div>
                    {activeQuestion !== null && <div className="assessment-inline-key-editor">
                      <div><span>Questão {String(activeQuestion + 1).padStart(2, '0')}</span><strong>{version.label} · {classroom?.name}</strong></div>
                      <div className="assessment-inline-key-options" role="group" aria-label={`Novo gabarito da questão ${activeQuestion + 1}`}>
                        {Array.from({ length: assessment.optionCount }, (_, optionIndex) => {
                          const letter = String.fromCharCode(65 + optionIndex)
                          return <button type="button" className={version.answerKey[activeQuestion] === letter ? 'selected' : ''} onClick={() => changeVersionAnswer(classId, version, activeQuestion, letter)} key={letter}>{letter}</button>
                        })}
                        <button type="button" className={cn('annul-question', version.answerKey[activeQuestion] === null && 'selected')} onClick={() => changeVersionAnswer(classId, version, activeQuestion, null)}><Ban size={13} /> Anular questão</button>
                        <button type="button" className={cn('cancel-question', version.answerKey[activeQuestion] === CANCELLED_ANSWER && 'selected')} onClick={() => changeVersionAnswer(classId, version, activeQuestion, CANCELLED_ANSWER)}><CircleOff size={13} /> Cancelar questão</button>
                        <button type="button" className="close-inline-key-editor" onClick={() => setEditingAnswer(null)} aria-label="Cancelar alteração"><X size={15} /></button>
                      </div>
                      <small>Anulada conta como acerto; cancelada é retirada do total de questões válidas. As correções desta versão são recalculadas automaticamente.</small>
                    </div>}
                  </div>
                })}
              </div>
            </article>
          )
        })}
      </section>

      <section className="assessment-version-roster">
        <header>
          <div><h3>Alunos e resultados</h3><p>Confira a nota geral, a situação da correção e a versão de gabarito de cada aluno.</p></div>
          <div className="assessment-roster-actions"><Button variant="secondary" size="sm" icon={Download} onClick={openResultExport}>Exportar notas</Button><label><span>Filtrar por turma</span><select value={studentClassFilter} onChange={(event) => setStudentClassFilter(event.target.value)}><option value="all">Todas as turmas</option>{assessment.classIds.map((classId) => { const classroom = data.classes.find((item) => item.id === classId); return <option value={classId} key={classId}>{classroom?.name || 'Turma removida'}</option> })}</select></label></div>
        </header>
        <div className="assessment-version-roster-summary"><Badge tone="blue">{versionedStudents.length} aluno{versionedStudents.length !== 1 ? 's' : ''}</Badge><span>Notas exibidas na escala de 0 a 10.</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>{sortableStudentHeader('name', 'Aluno')}{sortableStudentHeader('class', 'Turma')}{sortableStudentHeader('grade', 'Nota geral')}{sortableStudentHeader('status', 'Situação')}{sortableStudentHeader('version', 'Versão do gabarito')}</tr></thead>
            <tbody>{sortedStudentRows.map(({ student, classroom, version, allowedVersions, selectableVersions, result, resultTone, resultLabel }) => <tr key={student.id}><td><div className="assessment-version-student"><span style={{ background: `${classroom?.color}1c`, color: classroom?.color }}>{initials(student.name)}</span><div><strong>{student.name}</strong><small>{student.registration}</small></div></div></td><td><span className="class-tag" style={{ '--class-color': classroom?.color }}>{classroom?.name || 'Turma removida'}</span></td><td><div className={cn('assessment-student-grade', !result && 'empty')}><strong>{result ? formatSegesGrade(result.grade) : '—'}</strong>{result && <small>{Math.round(result.percentage)}%</small>}</div></td><td><Badge tone={resultTone}>{resultLabel}</Badge></td><td><select className="assessment-student-version-select" style={answerKeyVersionColor(assessment, version?.id)} value={version?.id || ''} onChange={(event) => changeStudentVersion(student, event.target.value)} disabled={closed || allowedVersions.length < 2} aria-label={`Versão do gabarito de ${student.name}`}>{selectableVersions.map((item) => <option value={item.id} style={answerKeyVersionColor(assessment, item.id)} key={item.id}>{item.label}</option>)}</select></td></tr>)}</tbody>
          </table>
        </div>
        {!versionedStudents.length && <div className="assessment-version-roster-empty">Nenhum aluno ativo nesta turma.</div>}
      </section>

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Exportar notas para o SEGES"
        subtitle="Gere um arquivo de um único simulado e recorte, pronto para conferência e lançamento."
        size="lg"
        footer={<><Button variant="ghost" onClick={() => setExportOpen(false)}>Cancelar</Button><Button icon={Download} disabled={!exportClassIds.length || !validExportMaxGrade || !(exportSummary[SEGES_RESULT_STATUS.ready] || 0)} onClick={exportSegesResults}>Exportar {exportSummary[SEGES_RESULT_STATUS.ready] || 0} nota{(exportSummary[SEGES_RESULT_STATUS.ready] || 0) !== 1 ? 's' : ''}</Button></>}
      >
        <div className="seges-results-export">
          <div className="seges-results-export-intro"><FileSpreadsheet size={22} /><div><strong>{assessment.title}</strong><span>{assessment.code} · cada arquivo representa somente o recorte escolhido abaixo.</span></div></div>
          <div className="seges-results-export-config">
            <Field label="Resultado a exportar" hint="Para várias áreas, faça uma exportação separada de cada recorte."><select value={exportScope} onChange={(event) => setExportScope(event.target.value)}><option value="all">Nota geral do simulado</option>{areaSummary.map(([area, count]) => <option value={area} key={area}>{area} · {count} {count === 1 ? 'questão' : 'questões'}</option>)}</select></Field>
            <Field label="Nota máxima" hint="A nota final é arredondada para uma casa decimal."><input type="text" inputMode="decimal" value={exportMaxGrade} onChange={(event) => setExportMaxGrade(event.target.value)} aria-invalid={!validExportMaxGrade} /></Field>
          </div>
          <section className="seges-results-export-classes">
            <div><strong>Turmas incluídas</strong><span>O arquivo pode reunir várias turmas; a extensão usará a turma aberta no SEGES.</span></div>
            <div>{assessment.classIds.map((classId) => {
              const classroom = data.classes.find((item) => item.id === classId)
              const checked = exportClassIds.includes(classId)
              return <label className={cn(checked && 'checked')} key={classId}><input type="checkbox" checked={checked} onChange={() => toggleExportClass(classId)} /><span style={{ background: classroom?.color }} /><strong>{classroom?.name || 'Turma removida'}</strong><CheckCircle2 size={15} /></label>
            })}</div>
          </section>
          <div className="seges-results-export-summary">
            <div><small>PRONTAS</small><strong>{exportSummary[SEGES_RESULT_STATUS.ready] || 0}</strong></div>
            <div><small>PARA REVISAR</small><strong>{exportSummary[SEGES_RESULT_STATUS.review] || 0}</strong></div>
            <div><small>SEM CORREÇÃO</small><strong>{exportSummary[SEGES_RESULT_STATUS.missing] || 0}</strong></div>
            <div><small>SEM DADOS DO RECORTE</small><strong>{exportSummary[SEGES_RESULT_STATUS.unavailable] || 0}</strong></div>
          </div>
          {(exportRows.length > (exportSummary[SEGES_RESULT_STATUS.ready] || 0)) && <div className="seges-results-export-warning"><AlertTriangle size={17} /><p><strong>Somente notas prontas recebem valor no arquivo.</strong><span>Pendências permanecem listadas com o respectivo status, mas a coluna de nota fica vazia para impedir lançamento indevido.</span></p></div>}
          <div className="seges-results-export-preview">
            <div><strong>Prévia</strong><span>{exportRows.length} aluno{exportRows.length !== 1 ? 's' : ''} nas turmas selecionadas</span></div>
            <div className="table-wrap"><table><thead><tr><th>ALUNO</th><th>TURMA</th><th>ACERTOS</th><th>NOTA</th><th>STATUS</th></tr></thead><tbody>{exportRows.slice(0, 8).map((row) => <tr key={row.student.id}><td><strong>{row.student.name}</strong></td><td>{row.classroom?.name || '—'}</td><td>{row.metrics ? `${row.metrics.correct}/${row.metrics.valid}` : '—'}</td><td>{row.exportable ? formatSegesGrade(row.metrics.grade) : '—'}</td><td><Badge tone={row.exportable ? 'green' : row.status === SEGES_RESULT_STATUS.review ? 'ochre' : 'neutral'}>{row.status.replaceAll('_', ' ')}</Badge></td></tr>)}</tbody></table></div>
            {exportRows.length > 8 && <small>Exibindo os 8 primeiros registros. O arquivo incluirá todos os {exportRows.length} alunos selecionados.</small>}
          </div>
        </div>
      </Modal>
    </div>
  )
}

export function AssessmentsPage({ data, setData, setPage, notify }) {
  const initialPrintAssessment = data.assessments.find((item) => item.id === new URLSearchParams(window.location.search).get('print'))
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailAssessmentId, setDetailAssessmentId] = useState(null)
  const [assessmentToDelete, setAssessmentToDelete] = useState(null)
  const [assessmentLifecycleId, setAssessmentLifecycleId] = useState(null)
  const [printAssessmentId, setPrintAssessmentId] = useState(initialPrintAssessment?.id || null)
  const [printClassIds, setPrintClassIds] = useState(initialPrintAssessment?.classIds || [])
  const [hidePrintRegistration, setHidePrintRegistration] = useState(false)
  const [questionCount, setQuestionCount] = useState(40)
  const [questionCountInput, setQuestionCountInput] = useState('40')
  const [optionCount, setOptionCount] = useState(4)
  const [subject, setSubject] = useState(subjectOptions[0])
  const [answerKeyVersions, setAnswerKeyVersions] = useState(initialAnswerKeyVersions)
  const [activeAnswerKeyVersionId, setActiveAnswerKeyVersionId] = useState('version-a')
  const [questionAreas, setQuestionAreas] = useState(Array(90).fill(subjectOptions[0]))
  const [bulkArea, setBulkArea] = useState(subjectOptions[0])
  const [selectedClasses, setSelectedClasses] = useState([])

  const filtered = data.assessments.filter((assessment) => {
    const matchText = assessment.title.toLowerCase().includes(search.toLowerCase()) || assessment.code.toLowerCase().includes(search.toLowerCase())
    const matchStatus = status === 'all' || status === 'closed' ? status === 'all' || isAssessmentClosed(assessment) : assessment.status === status
    return matchText && matchStatus
  })
  const detailAssessment = data.assessments.find((item) => item.id === detailAssessmentId)
  const lifecycleAssessment = data.assessments.find((item) => item.id === assessmentLifecycleId)
  const printAssessment = data.assessments.find((item) => item.id === printAssessmentId)
  const printStudents = useMemo(() => data.students.filter((student) => printClassIds.includes(student.classId) && student.status === 'Ativo'), [data.students, printClassIds])
  const answerSheetLayout = getAnswerSheetLayout(questionCount)
  const activeAnswerKeyVersion = answerKeyVersions.find((version) => version.id === activeAnswerKeyVersionId) || answerKeyVersions[0]
  const answerKey = activeAnswerKeyVersion?.answerKey || []

  function openPrint(assessment) {
    setPrintAssessmentId(assessment.id)
    setPrintClassIds(assessment.classIds)
  }

  function closePrint() {
    setPrintAssessmentId(null)
    setPrintClassIds([])
    setHidePrintRegistration(false)
  }

  function printSheets(mode) {
    document.body.dataset.sheetPrintMode = mode
    window.print()
    window.setTimeout(() => delete document.body.dataset.sheetPrintMode, 0)
  }

  function openCorrection(assessment, tab = 'scan') {
    const url = new URL(window.location.href)
    url.searchParams.set('assessment', assessment.id)
    url.searchParams.set('tab', tab)
    window.history.replaceState({}, '', url)
    setDetailAssessmentId(null)
    setPage('correction')
  }

  function setKey(index, value) {
    setAnswerKeyVersions((current) => current.map((version) => {
      if (version.id !== activeAnswerKeyVersionId) return version
      const next = [...version.answerKey]
      next[index] = value
      return { ...version, answerKey: next }
    }))
  }

  function changeOptionCount(nextCount) {
    setOptionCount(nextCount)
    setAnswerKeyVersions((current) => current.map((version) => ({
      ...version,
      answerKey: version.answerKey.map((answer) => {
        const optionIndex = answer ? answer.charCodeAt(0) - 65 : -1
        return optionIndex >= nextCount ? '' : answer
      }),
    })))
  }

  function updateQuestionCount(nextValue) {
    setQuestionCountInput(String(nextValue))
    const parsed = Number(nextValue)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 90) return
    setQuestionCount(parsed)
    setAnswerKeyVersions((current) => current.map((version) => ({
      ...version,
      answerKey: version.answerKey.length >= parsed ? version.answerKey : [...version.answerKey, ...Array(parsed - version.answerKey.length).fill('')],
    })))
    setQuestionAreas((current) => current.length >= parsed ? current : [...current, ...Array(parsed - current.length).fill(subject)])
  }

  function toggleSelectedClass(classId) {
    const selected = selectedClasses.includes(classId)
    setSelectedClasses((current) => selected ? current.filter((id) => id !== classId) : [...current, classId])
    setAnswerKeyVersions((current) => current.map((version, index) => ({
      ...version,
      classIds: selected
        ? version.classIds.filter((id) => id !== classId)
        : index === 0 ? [...version.classIds, classId] : version.classIds,
    })))
  }

  function addAnswerKeyVersion() {
    const usedLabels = new Set(answerKeyVersions.map((version) => version.label))
    let labelIndex = 0
    while (usedLabels.has(labelIndex < 26 ? `Versão ${String.fromCharCode(65 + labelIndex)}` : `Versão ${labelIndex + 1}`)) labelIndex += 1
    const id = uid('version')
    const version = {
      id,
      label: labelIndex < 26 ? `Versão ${String.fromCharCode(65 + labelIndex)}` : `Versão ${labelIndex + 1}`,
      answerKey: [...answerKey],
      classIds: [],
    }
    setAnswerKeyVersions((current) => [...current, version])
    setActiveAnswerKeyVersionId(id)
  }

  function removeAnswerKeyVersion(versionId) {
    if (answerKeyVersions.length === 1) return
    const remaining = answerKeyVersions.filter((version) => version.id !== versionId)
    setAnswerKeyVersions(remaining)
    if (activeAnswerKeyVersionId === versionId) setActiveAnswerKeyVersionId(remaining[0].id)
  }

  function toggleVersionClass(classId) {
    setAnswerKeyVersions((current) => current.map((version) => version.id === activeAnswerKeyVersionId ? {
      ...version,
      classIds: version.classIds.includes(classId) ? version.classIds.filter((id) => id !== classId) : [...version.classIds, classId],
    } : version))
  }

  function randomizeActiveAnswerKey() {
    const randomized = createRandomAnswerKey(questionCount, optionCount)
    setAnswerKeyVersions((current) => current.map((version) => version.id === activeAnswerKeyVersionId ? {
      ...version,
      answerKey: version.answerKey.map((answer, index) => index < questionCount ? randomized[index] : answer),
    } : version))
    notify('Gabarito aleatorizado', `${activeAnswerKeyVersion.label}: ${questionCount} respostas distribuídas entre A–${String.fromCharCode(64 + optionCount)}.`)
  }

  function changeSubject(nextSubject) {
    setQuestionAreas((current) => current.map((area) => !area || area === subject ? nextSubject : area))
    setSubject(nextSubject)
    setBulkArea(nextSubject)
  }

  function setQuestionArea(index, value) {
    setQuestionAreas((current) => current.map((area, areaIndex) => areaIndex === index ? value : area))
  }

  function applyAreaToAll() {
    const normalized = bulkArea.trim()
    if (!normalized) {
      notify('Informe uma área', 'Digite ou selecione a área que será aplicada às questões.', 'warning')
      return
    }
    setQuestionAreas((current) => current.map((area, index) => index < questionCount ? normalized : area))
  }

  function createAssessment(event) {
    event.preventDefault()
    const requestedQuestionCount = Number(questionCountInput)
    if (!Number.isInteger(requestedQuestionCount) || requestedQuestionCount < 1 || requestedQuestionCount > 90 || requestedQuestionCount !== questionCount) {
      notify('Quantidade de questões inválida', 'Informe um número inteiro entre 1 e 90.', 'warning')
      return
    }
    const normalizedSubject = subject.trim()
    if (!normalizedSubject) {
      notify('Informe o componente principal', 'Selecione uma sugestão ou escreva um componente curricular.', 'warning')
      return
    }
    if (!selectedClasses.length) {
      notify('Selecione ao menos uma turma', 'Cada simulado precisa estar associado a uma turma.', 'warning')
      return
    }
    const assignedVersions = answerKeyVersions.filter((version) => version.classIds.some((classId) => selectedClasses.includes(classId)))
    const classesWithoutVersion = selectedClasses.filter((classId) => !assignedVersions.some((version) => version.classIds.includes(classId)))
    if (classesWithoutVersion.length) {
      notify('Turma sem versão', 'Associe ao menos uma versão de gabarito a cada turma participante.', 'warning')
      return
    }
    if (assignedVersions.some((version) => version.answerKey.slice(0, questionCount).some((value) => !value))) {
      notify('Gabarito incompleto', 'Complete todas as questões de cada versão associada a uma turma.', 'warning')
      return
    }
    const form = new FormData(event.currentTarget)
    const normalizedAreas = questionAreas.slice(0, questionCount).map((area) => area.trim() || normalizedSubject)
    const savedVersions = assignedVersions.map((version) => ({
      id: version.id,
      label: version.label,
      answerKey: version.answerKey.slice(0, questionCount),
    }))
    const answerKeyVersionIdsByClass = Object.fromEntries(selectedClasses.map((classId) => [
      classId,
      assignedVersions.filter((version) => version.classIds.includes(classId)).map((version) => version.id),
    ]))
    const answerKeyVersionIdByStudent = Object.fromEntries(selectedClasses.flatMap((classId) => {
      const versionIds = answerKeyVersionIdsByClass[classId]
      return data.students
        .filter((student) => student.classId === classId)
        .map((student, index) => [student.id, versionIds[index % versionIds.length]])
    }))
    const primaryAnswerKey = savedVersions[0].answerKey
    const assessment = {
      id: uid('assessment'), title: String(form.get('title')).trim(), code: String(form.get('code')).trim().toUpperCase(),
      subjects: [normalizedSubject], classIds: selectedClasses, questionCount, optionCount,
      answerSheetFormat: answerSheetLayout.id,
      answerSheetMarkerLayout: CURRENT_MARKER_LAYOUT,
      questionAreas: normalizedAreas,
      answerKey: primaryAnswerKey,
      answerKeyVersions: savedVersions,
      answerKeyVersionIdsByClass,
      answerKeyVersionIdByStudent,
      answerKeysByClass: Object.fromEntries(selectedClasses.map((classId) => {
        const firstVersionId = answerKeyVersionIdsByClass[classId][0]
        return [classId, savedVersions.find((version) => version.id === firstVersionId)?.answerKey || primaryAnswerKey]
      })),
      date: String(form.get('date')),
      status: 'Pronto para aplicar', createdAt: new Date().toISOString(),
    }
    setData((current) => ({ ...current, assessments: [assessment, ...current.assessments] }))
    setCreateOpen(false)
    setQuestionCount(40); setQuestionCountInput('40'); setOptionCount(4); setSubject(subjectOptions[0]); setAnswerKeyVersions(initialAnswerKeyVersions()); setActiveAnswerKeyVersionId('version-a'); setQuestionAreas(Array(90).fill(subjectOptions[0])); setBulkArea(subjectOptions[0]); setSelectedClasses([])
    notify('Simulado criado', 'O gabarito foi salvo e as folhas já podem ser impressas.')
    openPrint(assessment)
  }

  function deleteAssessment() {
    if (!assessmentToDelete) return
    const submissionCount = data.submissions.filter((item) => item.assessmentId === assessmentToDelete.id).length
    setData((current) => ({
      ...current,
      assessments: current.assessments.filter((item) => item.id !== assessmentToDelete.id),
      submissions: current.submissions.filter((item) => item.assessmentId !== assessmentToDelete.id),
    }))
    if (printAssessmentId === assessmentToDelete.id) closePrint()
    setAssessmentToDelete(null)
    notify(
      'Simulado excluído',
      submissionCount
        ? `${submissionCount} ${submissionCount === 1 ? 'correção vinculada também foi removida' : 'correções vinculadas também foram removidas'}.`
        : 'O simulado foi removido do banco de dados local.',
    )
  }

  function changeAssessmentLifecycle() {
    if (!lifecycleAssessment) return
    const wasClosed = isAssessmentClosed(lifecycleAssessment)
    const hasSubmissions = data.submissions.some((submission) => submission.assessmentId === lifecycleAssessment.id)
    setData((current) => ({
      ...current,
      assessments: current.assessments.map((assessment) => {
        if (assessment.id !== lifecycleAssessment.id) return assessment
        return wasClosed
          ? reopenAssessment(assessment, { hasSubmissions })
          : closeAssessment(assessment)
      }),
    }))
    setAssessmentLifecycleId(null)
    notify(
      wasClosed ? 'Simulado reaberto' : 'Simulado encerrado',
      wasClosed
        ? hasSubmissions ? 'A correção voltou ao estado em andamento e suas revisões pendentes reaparecerão na fila.' : 'O simulado voltou a ficar pronto para aplicação.'
        : 'As respostas foram preservadas e o simulado deixou de gerar pendências de correção.',
    )
  }

  return (
    <div className="page-stack assessments-page">
      <div className="page-actions-row">
        <div className="filter-inline">
          <label className="search-input"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar simulado" /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos os status</option><option>Pronto para aplicar</option><option>Correção em andamento</option><option value="closed">Encerrados</option></select>
        </div>
        <Button icon={Plus} onClick={() => setCreateOpen(true)}>Novo simulado</Button>
      </div>

      <div className="assessment-summary">
        <span><ClipboardList size={18} /><strong>{data.assessments.length}</strong> simulados</span>
        <span><CalendarDays size={18} /><strong>{data.assessments.filter((item) => !isAssessmentClosed(item) && new Date(item.date) >= new Date()).length}</strong> próximos</span>
        <span><ScanLine size={18} /><strong>{getPendingReviewSubmissions(data.submissions, data.assessments).length}</strong> revisões pendentes</span>
      </div>

      <div className="assessment-list">
        {filtered.map((assessment, index) => {
          const classNames = assessment.classIds.map((id) => data.classes.find((item) => item.id === id)?.name).filter(Boolean)
          const totalStudents = data.students.filter((student) => assessment.classIds.includes(student.classId) && student.status === 'Ativo').length
          const submissions = data.submissions.filter((item) => item.assessmentId === assessment.id)
          const progress = totalStudents ? Math.min(100, Math.round(submissions.length / totalStudents * 100)) : 0
          const closed = isAssessmentClosed(assessment)
          const statusTone = closed ? 'neutral' : assessment.status.includes('andamento') ? 'ochre' : 'green'
          return (
            <article className="assessment-card" key={assessment.id}>
              <div className={`assessment-accent accent-${index % 4}`} />
              <div className="assessment-main">
                <div className="assessment-title-row"><span className={`large-doc-icon accent-${index % 4}`}><FileText size={22} /></span><div><div className="assessment-badges"><Badge tone={statusTone} dot>{getAssessmentStatusLabel(assessment)}</Badge><span>{assessment.code}</span></div><h3>{assessment.title}</h3><p>{assessment.subjects.join(' · ')}</p></div></div>
                <div className="assessment-meta">
                  <span><CalendarDays size={16} /><b>Aplicação</b>{formatDate(assessment.date)}</span>
                  <span><UsersRound size={16} /><b>Turmas</b>{classNames.join(', ')}</span>
                  <span><ClipboardList size={16} /><b>Estrutura</b>{assessment.questionCount} questões · {assessment.optionCount} alternativas</span>
                </div>
              </div>
              <div className="assessment-progress-block">
                <div><span>{closed ? 'Participação registrada' : 'Folhas processadas'}</span><strong>{submissions.length} <small>de {totalStudents}</small></strong></div>
                <div className="wide-progress"><i style={{ width: `${progress}%` }} /></div>
                <small>{closed ? `Encerrado com ${progress}% de participação` : `${progress}% concluído`}</small>
              </div>
              <div className="assessment-actions">
                <Button variant="secondary" size="sm" icon={Printer} onClick={() => openPrint(assessment)}>Folhas</Button>
                {assessment.status.includes('andamento') && <Button size="sm" icon={ScanLine} onClick={() => openCorrection(assessment)}>Continuar correção</Button>}
                <Button variant="ghost" size="sm" icon={Eye} onClick={() => setDetailAssessmentId(assessment.id)}>Detalhes</Button>
                <Button variant="ghost" size="sm" icon={closed ? RotateCcw : LockKeyhole} onClick={() => setAssessmentLifecycleId(assessment.id)}>{closed ? 'Reabrir' : 'Encerrar'}</Button>
                <button className="icon-button assessment-delete-button" title={`Excluir ${assessment.title}`} aria-label={`Excluir ${assessment.title}`} onClick={() => setAssessmentToDelete(assessment)}><Trash2 size={17} /></button>
              </div>
            </article>
          )
        })}
        {!filtered.length && <EmptyState icon={ClipboardList} title="Nenhum simulado encontrado" description="Ajuste os filtros ou crie um novo simulado." />}
      </div>

      <Modal
        open={Boolean(detailAssessment)}
        onClose={() => setDetailAssessmentId(null)}
        title={detailAssessment?.title || 'Detalhes do simulado'}
        subtitle="Informações da aplicação, turmas participantes e gabaritos utilizados."
        size="lg"
        footer={detailAssessment && <><Button variant="ghost" onClick={() => setDetailAssessmentId(null)}>Fechar</Button><Button variant="secondary" icon={Printer} onClick={() => { setDetailAssessmentId(null); openPrint(detailAssessment) }}>Gerar folhas</Button><Button variant="secondary" icon={isAssessmentClosed(detailAssessment) ? RotateCcw : LockKeyhole} onClick={() => setAssessmentLifecycleId(detailAssessment.id)}>{isAssessmentClosed(detailAssessment) ? 'Reabrir simulado' : 'Encerrar simulado'}</Button><Button icon={ScanLine} onClick={() => openCorrection(detailAssessment, 'responses')}>Ver correção</Button></>}
      >
        {detailAssessment && <AssessmentDetails assessment={detailAssessment} data={data} setData={setData} notify={notify} />}
      </Modal>

      <Modal
        open={Boolean(lifecycleAssessment)}
        onClose={() => setAssessmentLifecycleId(null)}
        title={isAssessmentClosed(lifecycleAssessment) ? 'Reabrir simulado?' : 'Encerrar simulado?'}
        subtitle="A situação pode ser alterada novamente quando necessário."
        footer={<><Button variant="ghost" onClick={() => setAssessmentLifecycleId(null)}>Cancelar</Button><Button icon={isAssessmentClosed(lifecycleAssessment) ? RotateCcw : LockKeyhole} onClick={changeAssessmentLifecycle}>{isAssessmentClosed(lifecycleAssessment) ? 'Reabrir simulado' : 'Encerrar simulado'}</Button></>}
      >
        {lifecycleAssessment && (() => {
          const linkedSubmissions = data.submissions.filter((submission) => submission.assessmentId === lifecycleAssessment.id)
          const activeStudentCount = data.students.filter((student) => student.status === 'Ativo' && lifecycleAssessment.classIds.includes(student.classId)).length
          const correctedStudentIds = new Set(linkedSubmissions.map((submission) => submission.studentId))
          const missingCount = Math.max(0, activeStudentCount - correctedStudentIds.size)
          const reviewCount = linkedSubmissions.filter((submission) => submission.status === 'Revisar').length
          const closed = isAssessmentClosed(lifecycleAssessment)
          return (
            <div className={cn('assessment-lifecycle-confirmation', closed && 'is-reopening')}>
              <span>{closed ? <RotateCcw size={22} /> : <LockKeyhole size={22} />}</span>
              <div>
                <strong>{lifecycleAssessment.title}</strong>
                <p>{closed
                  ? 'Novas folhas poderão ser corrigidas e as revisões arquivadas voltarão para a fila de pendências.'
                  : 'As notas e respostas existentes serão preservadas. Novas correções ficarão bloqueadas até que o simulado seja reaberto.'}</p>
                <ul>
                  <li>{linkedSubmissions.length} correção{linkedSubmissions.length !== 1 ? 'ões registradas' : ' registrada'}</li>
                  <li>{missingCount} aluno{missingCount !== 1 ? 's sem correção' : ' sem correção'}</li>
                  <li>{reviewCount} revisão{reviewCount !== 1 ? 'ões com ressalva' : ' com ressalva'}</li>
                </ul>
                {!closed && <small>Alunos sem correção e revisões com ressalva deixarão de aparecer como pendências operacionais.</small>}
              </div>
            </div>
          )
        })()}
      </Modal>

      <Modal
        open={Boolean(assessmentToDelete)}
        onClose={() => setAssessmentToDelete(null)}
        title="Excluir simulado?"
        subtitle="Esta ação altera definitivamente o banco de dados local."
        footer={<><Button variant="ghost" onClick={() => setAssessmentToDelete(null)}>Cancelar</Button><Button variant="danger" icon={Trash2} onClick={deleteAssessment}>Excluir simulado</Button></>}
      >
        {assessmentToDelete && (() => {
          const linkedSubmissions = data.submissions.filter((item) => item.assessmentId === assessmentToDelete.id).length
          return (
            <div className="delete-assessment-confirmation">
              <span><AlertTriangle size={22} /></span>
              <div>
                <strong>{assessmentToDelete.title}</strong>
                <p>
                  O simulado, seus gabaritos por turma e {linkedSubmissions
                    ? `${linkedSubmissions} ${linkedSubmissions === 1 ? 'correção vinculada' : 'correções vinculadas'}`
                    : 'todas as informações vinculadas'} serão excluídos.
                </p>
              </div>
            </div>
          )
        })()}
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Criar novo simulado" subtitle="Defina as turmas e o gabarito que será usado na correção." size="lg" footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button type="submit" form="assessment-form" icon={CheckCircle2}>Salvar e gerar folhas</Button></>}>
        <form id="assessment-form" onSubmit={createAssessment} className="assessment-form">
          <datalist id="assessment-question-areas">{QUESTION_AREA_SUGGESTIONS.map((area) => <option value={area} key={area} />)}</datalist>
          <datalist id="assessment-subjects">{subjectOptions.map((item) => <option value={item} key={item} />)}</datalist>
          <div className="form-section"><div className="section-number">1</div><div className="form-section-content"><h3>Identificação</h3><div className="form-grid two-columns"><Field label="Nome do simulado" required><input name="title" required placeholder="Ex.: Simulado SAEB · Setembro" /></Field><Field label="Código curto" required hint="Aparece na folha impressa."><input name="code" required maxLength="18" placeholder="SAEB-SET-26" /></Field><Field label="Componente principal" required hint="Selecione uma sugestão ou escreva outro componente."><input name="subject" required list="assessment-subjects" value={subject} onChange={(event) => changeSubject(event.target.value)} placeholder="Ex.: Geografia" /></Field><Field label="Data de aplicação" required><input name="date" required type="date" defaultValue="2026-08-12" /></Field></div></div></div>
          <div className="form-section"><div className="section-number">2</div><div className="form-section-content"><h3>Turmas participantes</h3><p>O mesmo simulado pode ser aplicado em turmas diferentes.</p><div className="check-card-grid">{data.classes.map((classroom) => { const count = data.students.filter((student) => student.classId === classroom.id && student.status === 'Ativo').length; const checked = selectedClasses.includes(classroom.id); return <label key={classroom.id} className={cn('check-card', checked && 'checked')}><input type="checkbox" checked={checked} onChange={() => toggleSelectedClass(classroom.id)} /><span><strong>{classroom.name}</strong><small>{classroom.shift} · {count} alunos</small></span><i><CheckCircle2 size={17} /></i></label> })}</div></div></div>
          <div className="form-section">
            <div className="section-number">3</div>
            <div className="form-section-content">
              <h3>Estrutura, gabarito e áreas</h3>
              <div className="assessment-structure-toolbar">
                <div className="question-structure-fields">
                  <div className="question-count-control">
                    <Field label="Questões" required hint="Digite qualquer número de 1 a 90."><input type="number" min="1" max="90" step="1" required value={questionCountInput} onChange={(event) => updateQuestionCount(event.target.value)} onBlur={() => { if (!Number.isInteger(Number(questionCountInput)) || Number(questionCountInput) < 1 || Number(questionCountInput) > 90) updateQuestionCount(questionCount) }} /></Field>
                    <small className="question-count-exact">O gabarito terá exatamente {questionCount} quest{questionCount === 1 ? 'ão' : 'ões'}.</small>
                  </div>
                  <Field label="Alternativas"><select value={optionCount} onChange={(event) => changeOptionCount(Number(event.target.value))}><option value="4">A–D</option><option value="5">A–E</option></select></Field>
                </div>
                <div className="bulk-area-control"><Field label="Aplicar uma área a todas"><input list="assessment-question-areas" value={bulkArea} onChange={(event) => setBulkArea(event.target.value)} placeholder="Digite ou selecione" /></Field><Button type="button" variant="secondary" icon={Layers3} onClick={applyAreaToAll}>Aplicar</Button></div>
              </div>
              <div className="answer-sheet-format-note"><Badge tone="blue">Formato {answerSheetLayout.label}</Badge><span>O formato físico usa {answerSheetLayout.columns} {answerSheetLayout.columns === 1 ? 'coluna' : 'colunas'} e marcadores protegidos ao redor das respostas; somente {questionCount} questão{questionCount !== 1 ? 'ões serão exibidas' : ' será exibida'}.</span></div>

              <div className="answer-key-version-manager">
                <header><div className="answer-key-version-heading"><strong>Versões do gabarito</strong><small>Crie versões diferentes e escolha as turmas que receberão cada uma.</small></div><div className="answer-key-version-actions"><Button type="button" variant="ghost" size="sm" icon={Shuffle} onClick={randomizeActiveAnswerKey}>Aleatorizar {activeAnswerKeyVersion.label}</Button><Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addAnswerKeyVersion}>Nova versão</Button></div></header>
                <div className="answer-key-version-tabs">
                  {answerKeyVersions.map((version) => <div className={version.id === activeAnswerKeyVersionId ? 'active' : ''} key={version.id}><button type="button" onClick={() => setActiveAnswerKeyVersionId(version.id)}><strong>{version.label}</strong><small>{version.classIds.length ? `${version.classIds.length} turma${version.classIds.length !== 1 ? 's' : ''}` : 'Sem turma'}</small></button>{answerKeyVersions.length > 1 && <button type="button" className="remove-version" aria-label={`Remover ${version.label}`} onClick={() => removeAnswerKeyVersion(version.id)}><X size={13} /></button>}</div>)}
                </div>
                <div className="answer-key-version-classes"><span>Aplicar {activeAnswerKeyVersion.label} a:</span><div>{selectedClasses.length ? selectedClasses.map((classId) => { const classroom = data.classes.find((item) => item.id === classId); const checked = activeAnswerKeyVersion.classIds.includes(classId); return <label className={checked ? 'checked' : ''} key={classId}><input type="checkbox" checked={checked} onChange={() => toggleVersionClass(classId)} /><span style={{ background: classroom?.color }} /><strong>{classroom?.name}</strong><CheckCircle2 size={14} /></label> }) : <small>Selecione as turmas participantes na etapa anterior.</small>}</div><p>Quando uma turma recebe mais de uma versão, elas são alternadas automaticamente entre seus alunos.</p></div>
              </div>

              <p className="area-editor-help">Editando <strong>{activeAnswerKeyVersion.label}</strong>. Cada questão pode ter uma área ou componente diferente; as áreas são compartilhadas pelas versões.</p>
              <div className="answer-key-editor">{Array.from({ length: questionCount }, (_, index) => <div className="key-row" key={index}><div className="key-answer-line"><strong>{String(index + 1).padStart(2, '0')}</strong>{Array.from({ length: optionCount }, (_, optionIndex) => { const letter = String.fromCharCode(65 + optionIndex); return <button type="button" key={letter} className={answerKey[index] === letter ? 'selected' : ''} onClick={() => setKey(index, letter)}>{letter}</button> })}</div><input className="question-area-input" list="assessment-question-areas" value={questionAreas[index]} onChange={(event) => setQuestionArea(index, event.target.value)} aria-label={`Área da questão ${index + 1}`} placeholder="Área da questão" /></div>)}</div>
            </div>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(printAssessment)} onClose={closePrint} title="Gerar folhas de respostas" subtitle="Gere as folhas dos alunos ou uma cópia avulsa para cadastro posterior." size="xl" footer={<><span className="footer-note"><CheckCircle2 size={16} /> {printStudents.length} folhas identificadas prontas</span><Button variant="ghost" onClick={closePrint}>Fechar</Button><Button variant="secondary" icon={UserPlus} onClick={() => printSheets('blank')}>Salvar folha sem aluno</Button><Button icon={Printer} disabled={!printStudents.length} onClick={() => printSheets('students')}>Imprimir / salvar PDF</Button></>}>
        {printAssessment && (
          <div className="print-modal-layout">
            <aside className="print-options">
              <h3>Turmas incluídas</h3><p>Selecione quem receberá esta versão.</p>
              {printAssessment.classIds.map((classId) => { const classroom = data.classes.find((item) => item.id === classId); const count = data.students.filter((student) => student.classId === classId && student.status === 'Ativo').length; const checked = printClassIds.includes(classId); return <label key={classId} className="print-class-option"><input type="checkbox" checked={checked} onChange={() => setPrintClassIds((current) => checked ? current.filter((id) => id !== classId) : [...current, classId])} /><span><strong>{classroom?.name}</strong><small>{count} alunos · {classroom?.shift}</small></span></label> })}
              <div className="print-sheet-options">
                <h4>Dados visíveis</h4>
                <label className="print-privacy-option"><input type="checkbox" checked={hidePrintRegistration} onChange={(event) => setHidePrintRegistration(event.target.checked)} /><span><strong>Ocultar matrícula</strong><small>O número de controle não aparecerá na folha.</small></span></label>
              </div>
              <div className="blank-sheet-note"><UserPlus size={17} /><p><strong>Aluno fora da lista?</strong>Use “Salvar folha sem aluno”. Nome, matrícula e turma poderão ser preenchidos à mão, e o cadastro será feito durante a correção.</p></div>
              <div className="print-tip"><Printer size={18} /><p><strong>Configuração recomendada</strong>Papel A4, escala 100%, margens “nenhuma” e orientação retrato. Os quatro marcadores ficam protegidos ao redor do quadro de respostas.</p></div>
            </aside>
            <div className="sheet-preview-area">
              {printStudents[0] && <div className="sheet-preview"><PrintableSheets students={[printStudents[0]]} assessment={printAssessment} classes={data.classes} school={data.school} hideRegistration={hidePrintRegistration} /><span>Prévia · folha 1 de {printStudents.length}</span></div>}
              {!printStudents.length && <div className="no-print-students"><UsersRound size={30} /><strong>Nenhuma turma selecionada</strong></div>}
            </div>
            <div className="all-print-sheets student-print-sheets"><PrintableSheets students={printStudents} assessment={printAssessment} classes={data.classes} school={data.school} hideRegistration={hidePrintRegistration} /></div>
            <div className="all-print-sheets blank-print-sheet"><PrintableSheets students={[null]} assessment={printAssessment} classes={data.classes} school={data.school} /></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
