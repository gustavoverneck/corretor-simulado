import { useMemo, useState } from 'react'
import { Plus, Search, ClipboardList, CalendarDays, UsersRound, Printer, ScanLine, CheckCircle2, Eye, FileText, Trash2, AlertTriangle, Layers3, X, Shuffle } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Modal } from '../components/ui'
import { PrintableSheets } from '../components/AnswerSheet'
import { createRandomAnswerKey, getAnswerKeyForClass, getAnswerKeyVersionForStudent, getAnswerKeyVersions, getAnswerKeyVersionsForClass, hasCustomAnswerKey } from '../lib/assessment'
import { QUESTION_AREA_SUGGESTIONS, uniqueQuestionAreas } from '../lib/knowledgeAreas'
import { getAnswerSheetLayout } from '../lib/omr'
import { average, cn, formatDate, initials, uid } from '../lib/utils'

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
  const submissions = data.submissions.filter((item) => item.assessmentId === assessment.id)
  const totalStudents = data.students.filter((student) => assessment.classIds.includes(student.classId) && student.status === 'Ativo').length
  const progress = totalStudents ? Math.min(100, Math.round((submissions.length / totalStudents) * 100)) : 0
  const pendingReviews = submissions.filter((item) => item.status === 'Revisar').length
  const areaCount = uniqueQuestionAreas(assessment).length
  const statusTone = assessment.status === 'Finalizado' ? 'neutral' : assessment.status.includes('andamento') ? 'ochre' : 'green'
  const versionedStudents = data.students
    .filter((student) => assessment.classIds.includes(student.classId) && student.status === 'Ativo')
    .filter((student) => studentClassFilter === 'all' || student.classId === studentClassFilter)
    .sort((first, second) => {
      const classDifference = assessment.classIds.indexOf(first.classId) - assessment.classIds.indexOf(second.classId)
      return classDifference || first.name.localeCompare(second.name, 'pt-BR')
    })

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

  return (
    <div className="assessment-detail">
      <div className="assessment-detail-heading">
        <span className="assessment-detail-icon"><FileText size={23} /></span>
        <div><div><Badge tone={statusTone} dot>{assessment.status}</Badge><em>{assessment.code}</em></div><strong>{assessment.subjects.join(' · ')}</strong><p>Aplicação em {formatDate(assessment.date)} · criado em {formatDate(assessment.createdAt)}</p></div>
      </div>

      <div className="assessment-detail-metrics">
        <div><small>QUESTÕES</small><strong>{assessment.questionCount}</strong><span>{areaCount} {areaCount === 1 ? 'área' : 'áreas'} · A–{String.fromCharCode(64 + assessment.optionCount)}</span></div>
        <div><small>ALUNOS</small><strong>{totalStudents}</strong><span>{assessment.classIds.length} {assessment.classIds.length === 1 ? 'turma' : 'turmas'}</span></div>
        <div><small>PROCESSADAS</small><strong>{submissions.length}</strong><span>{progress}% concluído</span></div>
        <div><small>MÉDIA</small><strong>{submissions.length ? `${average(submissions.map((item) => item.score))}%` : '—'}</strong><span>{pendingReviews} para revisar</span></div>
      </div>

      <div className="assessment-detail-progress"><div><span>Andamento da correção</span><strong>{submissions.length} de {totalStudents}</strong></div><div className="wide-progress"><i style={{ width: `${progress}%` }} /></div></div>

      <section className="assessment-detail-classes">
        <header><h3>Turmas e gabaritos</h3><p>A versão correta será escolhida automaticamente pelo QR Code do aluno.</p></header>
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
                {(keyVersions.length ? keyVersions : [{ id: 'default', label: 'Gabarito', answerKey: key }]).map((version) => <div key={version.id}><strong>{version.label}</strong><div className="assessment-detail-key" aria-label={`${version.label} de ${classroom?.name}`}>{version.answerKey.map((answer, index) => <span key={index}><small>{String(index + 1).padStart(2, '0')}</small><strong>{answer || '—'}</strong></span>)}</div></div>)}
              </div>
            </article>
          )
        })}
      </section>

      <section className="assessment-version-roster">
        <header>
          <div><h3>Versão por aluno</h3><p>Informação exclusiva do professor. A versão não aparece na folha de respostas.</p></div>
          <label><span>Filtrar por turma</span><select value={studentClassFilter} onChange={(event) => setStudentClassFilter(event.target.value)}><option value="all">Todas as turmas</option>{assessment.classIds.map((classId) => { const classroom = data.classes.find((item) => item.id === classId); return <option value={classId} key={classId}>{classroom?.name || 'Turma removida'}</option> })}</select></label>
        </header>
        <div className="assessment-version-roster-summary"><Badge tone="blue">{versionedStudents.length} aluno{versionedStudents.length !== 1 ? 's' : ''}</Badge><span>Distribuição usada automaticamente na impressão e na correção.</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>ALUNO</th><th>TURMA</th><th>VERSÃO DO GABARITO</th></tr></thead>
            <tbody>{versionedStudents.map((student) => {
              const classroom = data.classes.find((item) => item.id === student.classId)
              const version = getAnswerKeyVersionForStudent(assessment, student)
              const allowedVersions = getAnswerKeyVersionsForClass(assessment, student.classId)
              const selectableVersions = allowedVersions.length ? allowedVersions : version ? [version] : []
              return <tr key={student.id}><td><div className="assessment-version-student"><span style={{ background: `${classroom?.color}1c`, color: classroom?.color }}>{initials(student.name)}</span><div><strong>{student.name}</strong><small>{student.registration}</small></div></div></td><td><span className="class-tag" style={{ '--class-color': classroom?.color }}>{classroom?.name || 'Turma removida'}</span></td><td><select className="assessment-student-version-select" style={answerKeyVersionColor(assessment, version?.id)} value={version?.id || ''} onChange={(event) => changeStudentVersion(student, event.target.value)} disabled={allowedVersions.length < 2} aria-label={`Versão do gabarito de ${student.name}`}>{selectableVersions.map((item) => <option value={item.id} style={answerKeyVersionColor(assessment, item.id)} key={item.id}>{item.label}</option>)}</select></td></tr>
            })}</tbody>
          </table>
        </div>
        {!versionedStudents.length && <div className="assessment-version-roster-empty">Nenhum aluno ativo nesta turma.</div>}
      </section>
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
    return matchText && (status === 'all' || assessment.status === status)
  })
  const detailAssessment = data.assessments.find((item) => item.id === detailAssessmentId)
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

  return (
    <div className="page-stack assessments-page">
      <div className="page-actions-row">
        <div className="filter-inline">
          <label className="search-input"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar simulado" /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos os status</option><option>Pronto para aplicar</option><option>Correção em andamento</option><option>Finalizado</option></select>
        </div>
        <Button icon={Plus} onClick={() => setCreateOpen(true)}>Novo simulado</Button>
      </div>

      <div className="assessment-summary">
        <span><ClipboardList size={18} /><strong>{data.assessments.length}</strong> simulados</span>
        <span><CalendarDays size={18} /><strong>{data.assessments.filter((item) => new Date(item.date) >= new Date()).length}</strong> próximos</span>
        <span><ScanLine size={18} /><strong>{data.submissions.filter((item) => item.status === 'Revisar').length}</strong> revisões pendentes</span>
      </div>

      <div className="assessment-list">
        {filtered.map((assessment, index) => {
          const classNames = assessment.classIds.map((id) => data.classes.find((item) => item.id === id)?.name).filter(Boolean)
          const totalStudents = data.students.filter((student) => assessment.classIds.includes(student.classId) && student.status === 'Ativo').length
          const submissions = data.submissions.filter((item) => item.assessmentId === assessment.id)
          const progress = totalStudents ? Math.round(submissions.length / totalStudents * 100) : 0
          const statusTone = assessment.status === 'Finalizado' ? 'neutral' : assessment.status.includes('andamento') ? 'ochre' : 'green'
          return (
            <article className="assessment-card" key={assessment.id}>
              <div className={`assessment-accent accent-${index % 4}`} />
              <div className="assessment-main">
                <div className="assessment-title-row"><span className={`large-doc-icon accent-${index % 4}`}><FileText size={22} /></span><div><div className="assessment-badges"><Badge tone={statusTone} dot>{assessment.status}</Badge><span>{assessment.code}</span></div><h3>{assessment.title}</h3><p>{assessment.subjects.join(' · ')}</p></div></div>
                <div className="assessment-meta">
                  <span><CalendarDays size={16} /><b>Aplicação</b>{formatDate(assessment.date)}</span>
                  <span><UsersRound size={16} /><b>Turmas</b>{classNames.join(', ')}</span>
                  <span><ClipboardList size={16} /><b>Estrutura</b>{assessment.questionCount} questões · {assessment.optionCount} alternativas</span>
                </div>
              </div>
              <div className="assessment-progress-block">
                <div><span>Folhas processadas</span><strong>{submissions.length} <small>de {totalStudents}</small></strong></div>
                <div className="wide-progress"><i style={{ width: `${progress}%` }} /></div>
                <small>{progress}% concluído</small>
              </div>
              <div className="assessment-actions">
                <Button variant="secondary" size="sm" icon={Printer} onClick={() => openPrint(assessment)}>Folhas</Button>
                {assessment.status.includes('andamento') && <Button size="sm" icon={ScanLine} onClick={() => openCorrection(assessment)}>Continuar correção</Button>}
                <Button variant="ghost" size="sm" icon={Eye} onClick={() => setDetailAssessmentId(assessment.id)}>Detalhes</Button>
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
        footer={detailAssessment && <><Button variant="ghost" onClick={() => setDetailAssessmentId(null)}>Fechar</Button><Button variant="secondary" icon={Printer} onClick={() => { setDetailAssessmentId(null); openPrint(detailAssessment) }}>Gerar folhas</Button><Button icon={ScanLine} onClick={() => openCorrection(detailAssessment, 'keys')}>Ver gabaritos</Button></>}
      >
        {detailAssessment && <AssessmentDetails assessment={detailAssessment} data={data} setData={setData} notify={notify} />}
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
              <div className="answer-sheet-format-note"><Badge tone="blue">Formato {answerSheetLayout.label}</Badge><span>O formato físico usa {answerSheetLayout.columns} {answerSheetLayout.columns === 1 ? 'coluna' : 'colunas'}, mas somente {questionCount} questão{questionCount !== 1 ? 'ões serão exibidas' : ' será exibida'}.</span></div>

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

      <Modal open={Boolean(printAssessment)} onClose={closePrint} title="Gerar folhas de respostas" subtitle="Cada aluno recebe uma folha individual com QR Code próprio." size="xl" footer={<><span className="footer-note"><CheckCircle2 size={16} /> {printStudents.length} folhas prontas</span><Button variant="ghost" onClick={closePrint}>Fechar</Button><Button icon={Printer} onClick={() => window.print()}>Imprimir / salvar PDF</Button></>}>
        {printAssessment && (
          <div className="print-modal-layout">
            <aside className="print-options">
              <h3>Turmas incluídas</h3><p>Selecione quem receberá esta versão.</p>
              {printAssessment.classIds.map((classId) => { const classroom = data.classes.find((item) => item.id === classId); const count = data.students.filter((student) => student.classId === classId && student.status === 'Ativo').length; const checked = printClassIds.includes(classId); return <label key={classId} className="print-class-option"><input type="checkbox" checked={checked} onChange={() => setPrintClassIds((current) => checked ? current.filter((id) => id !== classId) : [...current, classId])} /><span><strong>{classroom?.name}</strong><small>{count} alunos · {classroom?.shift}</small></span></label> })}
              <div className="print-sheet-options">
                <h4>Dados visíveis</h4>
                <label className="print-privacy-option"><input type="checkbox" checked={hidePrintRegistration} onChange={(event) => setHidePrintRegistration(event.target.checked)} /><span><strong>Ocultar matrícula</strong><small>O número de controle não aparecerá na folha.</small></span></label>
              </div>
              <div className="print-tip"><Printer size={18} /><p><strong>Configuração recomendada</strong>Papel A4, escala 100%, margens “nenhuma” e orientação retrato.</p></div>
            </aside>
            <div className="sheet-preview-area">
              {printStudents[0] && <div className="sheet-preview"><PrintableSheets students={[printStudents[0]]} assessment={printAssessment} classes={data.classes} school={data.school} hideRegistration={hidePrintRegistration} /><span>Prévia · folha 1 de {printStudents.length}</span></div>}
              {!printStudents.length && <div className="no-print-students"><UsersRound size={30} /><strong>Nenhuma turma selecionada</strong></div>}
            </div>
            <div className="all-print-sheets"><PrintableSheets students={printStudents} assessment={printAssessment} classes={data.classes} school={data.school} hideRegistration={hidePrintRegistration} /></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
