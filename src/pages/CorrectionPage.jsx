import { useMemo, useRef, useState } from 'react'
import {
  UploadCloud, Camera, ScanLine, CheckCircle2, AlertTriangle, FileImage, RotateCcw,
  Save, MoreHorizontal, QrCode, Focus, CircleDot, ChevronRight, X, ClipboardList,
  ListChecks, PencilLine, UsersRound, Eye, Check, FileText, Files,
} from 'lucide-react'
import { Badge, Button, EmptyState, Modal } from '../components/ui'
import { analyzeAnswerSheet } from '../lib/omr'
import { getAnswerKeyForClass, getAnswerKeyForStudent, getAnswerKeyVersionForStudent, getAnswerKeyVersionsForClass, hasCustomAnswerKey, regradeAnswers } from '../lib/assessment'
import { getQuestionAreas, QUESTION_AREA_SUGGESTIONS } from '../lib/knowledgeAreas'
import { cn, uid } from '../lib/utils'

const answerStatuses = {
  correct: { label: 'Correta', tone: 'green' },
  wrong: { label: 'Incorreta', tone: 'red' },
  blank: { label: 'Em branco', tone: 'neutral' },
  multiple: { label: 'Múltipla', tone: 'red' },
  uncertain: { label: 'Revisar', tone: 'ochre' },
}

function AnswerKeyStrip({ answerKey, limit, compact = false }) {
  const visible = limit ? answerKey.slice(0, limit) : answerKey
  return (
    <div className={cn('answer-key-strip', compact && 'compact')}>
      {visible.map((answer, index) => <span key={index}><small>{String(index + 1).padStart(2, '0')}</small><strong>{answer || '—'}</strong></span>)}
      {limit && answerKey.length > limit && <em>+{answerKey.length - limit}</em>}
    </div>
  )
}

function ResultBreakdown({ result, compact = false }) {
  const total = result?.answers?.length || result?.total || 0
  const score = total ? Math.round(((result?.correct || 0) / total) * 100) : 0
  const metrics = [
    { key: 'correct', label: 'Acertos', value: result?.correct || 0, tone: 'correct' },
    { key: 'wrong', label: 'Erros', value: result?.wrong || 0, tone: 'wrong' },
    { key: 'blank', label: 'Em branco', value: result?.blank || 0, tone: 'blank' },
    { key: 'multiple', label: 'Múltiplas', value: result?.multiple || 0, tone: 'multiple' },
    { key: 'uncertain', label: 'Incertas', value: result?.uncertain || 0, tone: 'uncertain' },
  ]
  return (
    <div className={cn('result-breakdown', compact && 'is-compact')}>
      <div className="result-breakdown-score"><small>APROVEITAMENTO</small><strong>{score}%</strong><span>{result?.correct || 0} de {total} questões</span></div>
      {metrics.map((metric) => <div className={`result-breakdown-metric metric-${metric.tone}`} key={metric.key}><i /><p><small>{metric.label}</small><strong>{metric.value}</strong></p></div>)}
    </div>
  )
}

function DetailedAnswerList({ answers, assessment, questionAreas, onChange }) {
  if (!answers.length) return <div className="answer-list-empty"><ListChecks size={22} /><p>Nenhuma questão corresponde a este filtro.</p></div>
  return (
    <div className="answer-review-list detailed-answer-list">
      {answers.map((answer) => <div key={answer.question} className={cn('answer-review-row', `answer-${answer.status}`)}>
        <div className="answer-question-label"><strong>{String(answer.question).padStart(2, '0')}</strong><small title={questionAreas[answer.question - 1]}>{questionAreas[answer.question - 1] || 'Sem área'}</small></div>
        <div className="answer-choice-review">
          <div className="answer-options">
            {Array.from({ length: assessment.optionCount }, (_, index) => {
              const letter = String.fromCharCode(65 + index)
              return <button type="button" key={letter} className={cn(answer.selected.includes(letter) && 'marked', answer.expected === letter && 'expected')} onClick={() => onChange(answer.question - 1, letter)} aria-label={`Questão ${answer.question}, alternativa ${letter}`}>{letter}</button>
            })}
            <button type="button" className={answer.selected.length === 0 ? 'marked blank-choice' : 'blank-choice'} onClick={() => onChange(answer.question - 1, '')} aria-label={`Deixar questão ${answer.question} em branco`}>—</button>
          </div>
          <small>Marcada: {answer.selected.length ? answer.selected.join(' + ') : 'em branco'} · Gabarito: {answer.expected || '—'}</small>
        </div>
        <Badge tone={answerStatuses[answer.status]?.tone || 'neutral'}>{answerStatuses[answer.status]?.label || answer.status}</Badge>
      </div>)}
    </div>
  )
}

function AnswerKeysPanel({ data, setData, notify, initialAssessmentId }) {
  const [assessmentId, setAssessmentId] = useState(initialAssessmentId || data.assessments[0]?.id)
  const assessment = data.assessments.find((item) => item.id === assessmentId) || data.assessments[0]
  const [classId, setClassId] = useState(assessment?.classIds[0] || '')
  const [versionId, setVersionId] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState([])
  const [areaDraft, setAreaDraft] = useState([])
  const [copySource, setCopySource] = useState('')
  const classroom = data.classes.find((item) => item.id === classId)
  const classVersions = getAnswerKeyVersionsForClass(assessment, classId)
  const selectedVersion = classVersions.find((version) => version.id === versionId) || classVersions[0]
  const answerKey = selectedVersion?.answerKey || getAnswerKeyForClass(assessment, classId)
  const questionAreas = getQuestionAreas(assessment)
  const areaSummary = [...questionAreas.reduce((summary, area) => summary.set(area, (summary.get(area) || 0) + 1), new Map()).entries()]
  const isCustom = hasCustomAnswerKey(assessment, classId)
  const classStudents = data.students.filter((student) => student.classId === classId && student.status === 'Ativo').length
  const classSubmissions = data.submissions.filter((submission) => {
    const student = data.students.find((item) => item.id === submission.studentId)
    return submission.assessmentId === assessment?.id && student?.classId === classId
  })

  function chooseAssessment(nextId) {
    const next = data.assessments.find((item) => item.id === nextId)
    setAssessmentId(nextId)
    setClassId(next?.classIds[0] || '')
    setVersionId('')
    setEditing(false)
    setAreaDraft([])
    setCopySource('')
  }

  function chooseClass(nextId) {
    setClassId(nextId)
    setVersionId('')
    setEditing(false)
    setAreaDraft([])
    setCopySource('')
  }

  function chooseVersion(nextId) {
    setVersionId(nextId)
    setEditing(false)
    setAreaDraft([])
    setCopySource('')
  }

  function startEditing(key = answerKey) {
    setDraft([...key])
    setAreaDraft([...questionAreas])
    setEditing(true)
  }

  function setDraftAnswer(index, letter) {
    setDraft((current) => current.map((value, keyIndex) => keyIndex === index ? letter : value))
  }

  function setDraftArea(index, area) {
    setAreaDraft((current) => current.map((value, areaIndex) => areaIndex === index ? area : value))
  }

  function copyFromClass(sourceId) {
    if (!sourceId) return
    setCopySource(sourceId)
    startEditing(getAnswerKeyForClass(assessment, sourceId))
  }

  function saveAnswerKey() {
    if (draft.length !== assessment.questionCount || draft.some((answer) => !answer)) {
      notify('Gabarito incompleto', 'Todas as questões precisam ter uma resposta correta.', 'warning')
      return
    }
    if (areaDraft.length !== assessment.questionCount || areaDraft.some((area) => !area.trim())) {
      notify('Área não definida', 'Informe a área ou componente de todas as questões.', 'warning')
      return
    }
    const normalizedAreas = areaDraft.map((area) => area.trim())
    const studentIds = new Set(data.students.filter((student) => {
      if (!selectedVersion) return student.classId === classId
      return getAnswerKeyVersionForStudent(assessment, student)?.id === selectedVersion.id
    }).map((student) => student.id))
    const regradableCount = data.submissions.filter((submission) => submission.assessmentId === assessment.id && studentIds.has(submission.studentId) && Array.isArray(submission.answers)).length
    setData((current) => ({
      ...current,
      assessments: current.assessments.map((item) => item.id === assessment.id ? {
        ...item,
        questionAreas: normalizedAreas,
        answerKey: selectedVersion && item.answerKeyVersions?.[0]?.id === selectedVersion.id ? draft : item.answerKey,
        answerKeyVersions: selectedVersion ? item.answerKeyVersions.map((version) => version.id === selectedVersion.id ? { ...version, answerKey: draft } : version) : item.answerKeyVersions,
        answerKeysByClass: selectedVersion ? Object.fromEntries(item.classIds.map((itemClassId) => {
          const firstVersionId = item.answerKeyVersionIdsByClass?.[itemClassId]?.[0]
          return [itemClassId, firstVersionId === selectedVersion.id ? draft : item.answerKeysByClass?.[itemClassId] || item.answerKey]
        })) : { ...item.answerKeysByClass, [classId]: draft },
      } : item),
      submissions: current.submissions.map((submission) => {
        if (submission.assessmentId !== assessment.id || !studentIds.has(submission.studentId) || !Array.isArray(submission.answers)) return submission
        const graded = regradeAnswers(submission.answers, draft)
        return {
          ...submission, ...graded, answerKeySnapshot: draft,
          status: graded.multiple > 0 || graded.uncertain > 0 ? 'Revisar' : 'Corrigido',
          correctedAt: new Date().toISOString(),
        }
      }),
    }))
    setEditing(false)
    setAreaDraft([])
    setCopySource('')
    notify('Gabarito e áreas salvos', `${selectedVersion?.label || classroom?.name}: ${draft.length} respostas classificadas${regradableCount ? ` e ${regradableCount} correção(ões) recalculada(s)` : ''}.`)
  }

  if (!assessment) return <EmptyState icon={ClipboardList} title="Nenhum simulado" description="Crie um simulado antes de cadastrar o gabarito." />

  return (
    <div className="answer-key-layout">
      <aside className="panel answer-key-assessments">
        <header><h3>Simulados</h3><Badge tone="neutral">{data.assessments.length}</Badge></header>
        <div>{data.assessments.map((item) => <button key={item.id} className={item.id === assessment.id ? 'active' : ''} onClick={() => chooseAssessment(item.id)}><span><strong>{item.title}</strong><small>{item.code} · {item.questionCount} questões</small></span><em>{item.classIds.length}</em></button>)}</div>
      </aside>

      <section className="panel answer-key-workspace">
        <header className="answer-key-header">
          <div><div className="eyebrow">GABARITO CADASTRADO</div><h2>{assessment.title}</h2><p>{assessment.subjects.join(' · ')} · {assessment.questionCount} questões · alternativas A–{String.fromCharCode(64 + assessment.optionCount)}</p></div>
          {!editing && <Button icon={PencilLine} onClick={() => startEditing()}>Editar gabarito</Button>}
        </header>

        <div className="answer-key-class-tabs">
          {assessment.classIds.map((id) => {
            const item = data.classes.find((entry) => entry.id === id)
            return <button key={id} className={id === classId ? 'active' : ''} onClick={() => chooseClass(id)}><span style={{ background: item?.color }} /><strong>{item?.name}</strong><small>{hasCustomAnswerKey(assessment, id) ? 'Versão própria' : 'Gabarito padrão'}</small></button>
          })}
        </div>

        {classVersions.length > 1 && <div className="answer-key-version-selector"><span>VERSÕES DE {classroom?.name?.toUpperCase()}</span><div>{classVersions.map((version) => <button key={version.id} className={selectedVersion?.id === version.id ? 'active' : ''} onClick={() => chooseVersion(version.id)}>{version.label}<small>{data.students.filter((student) => student.classId === classId && getAnswerKeyVersionForStudent(assessment, student)?.id === version.id).length} alunos</small></button>)}</div></div>}

        <div className="answer-key-summary-row">
          <div><span className="class-key-icon" style={{ '--class-color': classroom?.color }}><UsersRound size={20} /></span><p><strong>{classroom?.name} · {classroom?.shift}</strong><small>{classStudents} alunos · {classSubmissions.length} folhas corrigidas</small></p></div>
          <Badge tone={isCustom ? 'purple' : 'green'}>{selectedVersion ? selectedVersion.label : isCustom ? 'Gabarito específico desta turma' : 'Igual ao gabarito padrão'}</Badge>
        </div>

        {editing ? (
          <div className="key-edit-area">
            <datalist id="correction-question-areas">{QUESTION_AREA_SUGGESTIONS.map((area) => <option value={area} key={area} />)}</datalist>
            <div className="key-edit-toolbar">
              <div><strong>Editando {selectedVersion ? `${selectedVersion.label} · ${classroom?.name}` : classroom?.name}</strong><small>Defina a resposta e a área de cada questão. As áreas valem para todas as turmas.</small></div>
              {assessment.classIds.length > 1 && <label>Copiar de<select value={copySource} onChange={(event) => copyFromClass(event.target.value)}><option value="">Outra turma...</option>{assessment.classIds.filter((id) => id !== classId).map((id) => <option key={id} value={id}>{data.classes.find((item) => item.id === id)?.name}</option>)}</select></label>}
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setDraft([...assessment.answerKey])}>Usar padrão</Button>
            </div>
            <div className="answer-key-full-grid">
              {draft.map((answer, index) => <div className="full-key-row" key={index}><div className="full-key-answer-line"><strong>{String(index + 1).padStart(2, '0')}</strong><div>{Array.from({ length: assessment.optionCount }, (_, option) => { const letter = String.fromCharCode(65 + option); return <button key={letter} className={answer === letter ? 'selected' : ''} onClick={() => setDraftAnswer(index, letter)}>{letter}</button> })}</div></div><input list="correction-question-areas" value={areaDraft[index] || ''} onChange={(event) => setDraftArea(index, event.target.value)} aria-label={`Área da questão ${index + 1}`} placeholder="Área ou componente" /></div>)}
            </div>
            <div className="key-edit-footer"><div><AlertTriangle size={16} /><p>As áreas são compartilhadas entre as turmas. Alterações no gabarito recalculam as correções desta turma.</p></div><Button variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button><Button icon={Save} onClick={saveAnswerKey}>Salvar alterações</Button></div>
          </div>
        ) : (
          <div className="answer-key-view"><AnswerKeyStrip answerKey={answerKey} /><div className="question-area-summary"><span>ÁREAS DAS QUESTÕES</span><div>{areaSummary.map(([area, count]) => <Badge tone="neutral" key={area}>{area} · {count}</Badge>)}</div></div><div className="key-legend"><span><i /> Número da questão</span><span><i /> Resposta correta</span></div></div>
        )}
      </section>
    </div>
  )
}

function ReviewQueue({ data, setData, notify }) {
  const [selectedId, setSelectedId] = useState(null)
  const [draftAnswers, setDraftAnswers] = useState([])
  const pending = data.submissions.filter((item) => item.status === 'Revisar')
  const selected = data.submissions.find((item) => item.id === selectedId)
  const student = data.students.find((item) => item.id === selected?.studentId)
  const assessment = data.assessments.find((item) => item.id === selected?.assessmentId)
  const classroom = data.classes.find((item) => item.id === student?.classId)
  const answerKey = getAnswerKeyForStudent(assessment, student)

  function openReview(submission) {
    if (!Array.isArray(submission.answers)) {
      if (window.confirm('Esta correção antiga possui apenas o resumo. Deseja marcá-la como revisada?')) {
        setData((current) => ({ ...current, submissions: current.submissions.map((item) => item.id === submission.id ? { ...item, status: 'Corrigido', multiple: 0, uncertain: 0 } : item) }))
        notify('Revisão concluída', 'A pendência foi removida da fila.')
      }
      return
    }
    setSelectedId(submission.id)
    setDraftAnswers(submission.answers.map((answer) => ({ ...answer, selected: [...answer.selected] })))
  }

  function changeDraftAnswer(questionIndex, letter) {
    setDraftAnswers((current) => current.map((answer, index) => {
      if (index !== questionIndex) return answer
      const selectedAnswers = letter ? [letter] : []
      return { ...answer, selected: selectedAnswers, status: !letter ? 'blank' : letter === answerKey[index] ? 'correct' : 'wrong' }
    }))
  }

  function saveReview() {
    const graded = regradeAnswers(draftAnswers, answerKey, { preserveUncertain: false })
    const stillPending = graded.multiple > 0 || graded.uncertain > 0
    setData((current) => ({ ...current, submissions: current.submissions.map((item) => item.id === selected.id ? { ...item, ...graded, status: stillPending ? 'Revisar' : 'Corrigido', reviewedAt: new Date().toISOString(), answerKeySnapshot: answerKey } : item) }))
    setSelectedId(null)
    setDraftAnswers([])
    notify(stillPending ? 'Revisão salva' : 'Revisão concluída', stillPending ? 'Ainda existem respostas que precisam ser resolvidas.' : 'A nota foi recalculada com o gabarito da turma.')
  }

  return (
    <>
      <section className="panel review-queue-panel">
        <header className="panel-header"><div><h3>Fila de revisões</h3><p>Folhas com marcação múltipla ou leitura incerta</p></div><Badge tone={pending.length ? 'ochre' : 'green'}>{pending.length} pendente{pending.length !== 1 ? 's' : ''}</Badge></header>
        {pending.length ? <div className="table-wrap"><table><thead><tr><th>ALUNO</th><th>TURMA</th><th>SIMULADO</th><th>OCORRÊNCIAS</th><th>RESULTADO ATUAL</th><th /></tr></thead><tbody>{pending.map((submission) => { const itemStudent = data.students.find((item) => item.id === submission.studentId); const itemClass = data.classes.find((item) => item.id === itemStudent?.classId); const itemAssessment = data.assessments.find((item) => item.id === submission.assessmentId); return <tr key={submission.id}><td><strong>{itemStudent?.name}</strong><small className="cell-subtitle">{itemStudent?.registration}</small></td><td><span className="class-tag" style={{ '--class-color': itemClass?.color }}>{itemClass?.name}</span></td><td>{itemAssessment?.title}</td><td><div className="issue-badges">{submission.multiple > 0 && <Badge tone="red">{submission.multiple} múltipla(s)</Badge>}{submission.uncertain > 0 && <Badge tone="ochre">{submission.uncertain} incerta(s)</Badge>}{!submission.uncertain && !submission.multiple && <Badge tone="ochre">Revisão manual</Badge>}</div></td><td><strong>{submission.score}%</strong><small className="cell-subtitle">{submission.correct}/{itemAssessment?.questionCount} acertos</small></td><td><Button size="sm" variant="secondary" icon={Eye} onClick={() => openReview(submission)}>Revisar</Button></td></tr> })}</tbody></table></div> : <EmptyState icon={CheckCircle2} title="Tudo revisado" description="Não há marcações ambíguas aguardando conferência." />}
      </section>

      <Modal open={Boolean(selected)} onClose={() => setSelectedId(null)} title="Revisar respostas" subtitle={`${student?.name || ''} · ${classroom?.name || ''} · ${assessment?.title || ''}`} size="lg" footer={<><Button variant="ghost" onClick={() => setSelectedId(null)}>Cancelar</Button><Button icon={Check} onClick={saveReview}>Concluir revisão</Button></>}>
        {selected && <div className="saved-review"><div className="saved-review-summary"><Badge tone="blue">Gabarito {classroom?.name}</Badge><span>Escolha uma única resposta em cada questão destacada. O resultado será recalculado ao concluir.</span></div><div className="answer-review-list">{draftAnswers.map((answer, index) => <div key={answer.question} className={cn('answer-review-row', `answer-${answer.status}`)}><strong>{String(answer.question).padStart(2, '0')}</strong><div className="answer-options">{Array.from({ length: assessment.optionCount }, (_, option) => { const letter = String.fromCharCode(65 + option); return <button key={letter} className={cn(answer.selected.includes(letter) && 'marked', answerKey[index] === letter && 'expected')} onClick={() => changeDraftAnswer(index, letter)}>{letter}</button> })}<button className={answer.selected.length === 0 ? 'marked blank-choice' : 'blank-choice'} onClick={() => changeDraftAnswer(index, '')}>—</button></div><Badge tone={answerStatuses[answer.status]?.tone || 'neutral'}>{answerStatuses[answer.status]?.label || answer.status}</Badge></div>)}</div></div>}
      </Modal>
    </>
  )
}

export function CorrectionPage({ data, setData, notify }) {
  const fileInput = useRef(null)
  const cameraInput = useRef(null)
  const requestedAssessmentId = new URLSearchParams(window.location.search).get('assessment')
  const initialAssessment = data.assessments.find((item) => item.id === requestedAssessmentId)
    || data.assessments.find((item) => item.status.includes('andamento'))
    || data.assessments[0]
  const [tab, setTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('tab')
    return ['scan', 'keys', 'reviews'].includes(requested) ? requested : 'scan'
  })
  const [assessmentId, setAssessmentId] = useState(initialAssessment?.id)
  const [classId, setClassId] = useState(initialAssessment?.classIds[0] || '')
  const [studentId, setStudentId] = useState('')
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [batch, setBatch] = useState(null)
  const [batchPreviewIndex, setBatchPreviewIndex] = useState(null)
  const [batchFilter, setBatchFilter] = useState('all')
  const [fileName, setFileName] = useState('')
  const [filter, setFilter] = useState('all')
  const assessment = data.assessments.find((item) => item.id === assessmentId)
  const classroom = data.classes.find((item) => item.id === classId)
  const answerKey = getAnswerKeyForClass(assessment, classId)
  const eligibleStudents = data.students.filter((student) => student.classId === classId && student.status === 'Ativo')
  const resultAssessment = data.assessments.find((item) => item.id === result?.assessmentId) || assessment
  const detectedStudentId = result?.identity?.studentId || studentId
  const detectedStudent = data.students.find((item) => item.id === detectedStudentId)
  const resultClassId = result?.classId || detectedStudent?.classId || classId
  const resultClassroom = data.classes.find((item) => item.id === resultClassId)
  const resultAnswerKeyVersion = detectedStudent ? getAnswerKeyVersionForStudent(resultAssessment, detectedStudent) : null
  const resultAnswerKey = detectedStudent ? getAnswerKeyForStudent(resultAssessment, detectedStudent) : getAnswerKeyForClass(resultAssessment, resultClassId)
  const resultQuestionAreas = getQuestionAreas(resultAssessment)
  const resultEligibleStudents = data.students.filter((student) => resultAssessment?.classIds.includes(student.classId) && student.status === 'Ativo')
  const resultClassCompatible = Boolean(detectedStudent && resultAssessment?.classIds.includes(detectedStudent.classId))
  const existingResultSubmission = detectedStudent && resultAssessment
    ? data.submissions.find((item) => item.assessmentId === resultAssessment.id && item.studentId === detectedStudent.id)
    : null
  const recent = useMemo(() => [...data.submissions].sort((a, b) => new Date(b.correctedAt) - new Date(a.correctedAt)).slice(0, 8), [data.submissions])
  const batchRows = useMemo(() => {
    if (!batch) return []
    const seen = new Set()
    return batch.items.map((item, index) => {
      const itemAssessment = data.assessments.find((entry) => entry.id === item.assessmentId)
      const itemStudent = data.students.find((entry) => entry.id === item.identity?.studentId)
      const itemClass = data.classes.find((entry) => entry.id === itemStudent?.classId)
      const existingSubmission = itemStudent && itemAssessment
        ? data.submissions.find((entry) => entry.assessmentId === itemAssessment.id && entry.studentId === itemStudent.id)
        : null
      let issue = item.error || ''
      if (!issue && !itemAssessment) issue = 'Simulado não encontrado'
      if (!issue && !itemStudent) issue = 'Aluno não identificado'
      if (!issue && !itemAssessment.classIds.includes(itemStudent.classId)) issue = 'Turma incompatível'
      const pairKey = itemStudent && itemAssessment ? `${itemAssessment.id}:${itemStudent.id}` : ''
      if (!issue && seen.has(pairKey)) issue = 'Folha duplicada no PDF'
      if (!issue) seen.add(pairKey)
      const needsReview = !issue && (item.multiple > 0 || item.uncertain > 0 || item.markersFound < 4)
      return { index, item, assessment: itemAssessment, student: itemStudent, classroom: itemClass, existingSubmission, issue, pairKey, needsReview, valid: !issue }
    })
  }, [batch, data])
  const batchSaveable = batchRows.filter((row) => row.valid)
  const batchNeedsReview = batchSaveable.filter((row) => row.needsReview).length
  const batchReplacements = batchSaveable.filter((row) => row.existingSubmission).length
  const batchUnresolved = batchRows.length - batchSaveable.length
  const batchPreview = batchPreviewIndex === null ? null : batchRows.find((row) => row.index === batchPreviewIndex)
  const batchTotals = batchSaveable.reduce((summary, row) => ({
    total: summary.total + (row.item.answers?.length || 0),
    correct: summary.correct + (row.item.correct || 0),
    wrong: summary.wrong + (row.item.wrong || 0),
    blank: summary.blank + (row.item.blank || 0),
    multiple: summary.multiple + (row.item.multiple || 0),
    uncertain: summary.uncertain + (row.item.uncertain || 0),
  }), { total: 0, correct: 0, wrong: 0, blank: 0, multiple: 0, uncertain: 0 })
  const batchPreviewAreas = getQuestionAreas(batchPreview?.assessment)
  const visibleBatchAnswers = batchPreview?.item.answers?.filter((answer) => batchFilter === 'all' || answer.status === batchFilter) || []
  const batchPreviewEligibleStudents = data.students.filter((student) => batchPreview?.assessment?.classIds.includes(student.classId) && student.status === 'Ativo')

  function chooseAssessment(nextId) {
    const next = data.assessments.find((item) => item.id === nextId)
    setAssessmentId(nextId)
    setClassId(next?.classIds[0] || '')
    setStudentId('')
  }

  function resolveRecognitionContext(identity) {
    const recognizedAssessment = data.assessments.find((item) => item.id === identity?.assessmentId) || assessment
    const recognizedStudent = data.students.find((item) => item.id === identity?.studentId)
    const recognizedClassId = recognizedStudent?.classId || classId
    return {
      assessment: recognizedAssessment,
      classId: recognizedClassId,
      answerKey: recognizedStudent ? getAnswerKeyForStudent(recognizedAssessment, recognizedStudent) : getAnswerKeyForClass(recognizedAssessment, recognizedClassId),
    }
  }

  async function processPdf(file) {
    if (file.size > 100 * 1024 * 1024) {
      notify('PDF muito grande', 'Use um arquivo de até 100 MB ou divida-o em dois lotes.', 'warning')
      return
    }
    setFileName(file.name)
    setProcessing(true)
    setProcessingProgress({ current: 0, total: 0 })
    setResult(null)
    setBatch(null)
    setBatchFilter('all')
    const items = []
    try {
      const { processPdfPages } = await import('../lib/pdf')
      await processPdfPages(file, async (pageFile, pageNumber, totalPages) => {
        setProcessingProgress({ current: pageNumber, total: totalPages })
        try {
          const analyzed = await analyzeAnswerSheet(
            pageFile,
            assessment,
            { studentId: null, assessmentId },
            data.settings?.omr,
            resolveRecognitionContext,
          )
          items.push({ ...analyzed, pageNumber, pageFilename: pageFile.name })
        } catch (error) {
          items.push({ pageNumber, pageFilename: pageFile.name, error: error.message || 'Página não reconhecida.' })
        }
      })
      setBatch({ fileName: file.name, totalPages: items.length, items })
      const identified = items.filter((item) => data.students.some((student) => student.id === item.identity?.studentId)).length
      notify('PDF analisado', `${items.length} página(s) processada(s) · ${identified} aluno(s) identificado(s).`, identified === items.length ? 'success' : 'warning')
    } catch (error) {
      notify('Não foi possível abrir o PDF', error.message || 'Verifique se o arquivo é válido e não possui senha.', 'warning')
    } finally {
      setProcessing(false)
      setProcessingProgress(null)
    }
  }

  async function processFile(file) {
    if (!file || !assessment) return
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (isPdf) {
      await processPdf(file)
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      notify('Arquivo muito grande', 'Use uma imagem de até 15 MB.', 'warning')
      return
    }
    if (answerKey.length !== assessment.questionCount) {
      notify('Gabarito incompleto', `Confira o gabarito de ${classroom?.name} antes de corrigir.`, 'warning')
      return
    }
    setFileName(file.name)
    setProcessing(true)
    setResult(null)
    try {
      const analyzed = await analyzeAnswerSheet(
        file,
        assessment,
        { studentId: studentId || null, assessmentId },
        data.settings?.omr,
        resolveRecognitionContext,
      )
      setFilter('all')
      setResult(analyzed)
      if (!analyzed.qrFound && !studentId) notify('QR Code não identificado', 'Selecione o aluno antes de salvar a correção.', 'warning')
      else if (analyzed.qrFound && !data.students.some((item) => item.id === analyzed.identity?.studentId)) notify('Aluno não encontrado', 'O QR foi lido, mas o aluno não existe mais no banco local.', 'warning')
    } catch (error) {
      notify('Não foi possível ler a folha', error.message || 'Tente uma foto mais nítida.', 'warning')
    } finally {
      setProcessing(false)
    }
  }

  function changeAnswer(questionIndex, letter) {
    setResult((current) => {
      const changed = current.answers.map((answer, index) => index === questionIndex ? { ...answer, selected: letter ? [letter] : [], status: !letter ? 'blank' : letter === resultAnswerKey[index] ? 'correct' : 'wrong', expected: resultAnswerKey[index] } : answer)
      return { ...current, ...regradeAnswers(changed, resultAnswerKey), classId: resultClassId }
    })
  }

  function assignManualStudent(nextStudentId) {
    setStudentId(nextStudentId)
    const student = data.students.find((item) => item.id === nextStudentId)
    const nextClassId = student?.classId || classId
    const nextKey = student ? getAnswerKeyForStudent(resultAssessment, student) : getAnswerKeyForClass(resultAssessment, nextClassId)
    setResult((current) => current ? { ...current, identity: { ...current.identity, studentId: nextStudentId, assessmentId: resultAssessment.id }, classId: nextClassId, ...regradeAnswers(current.answers, nextKey) } : current)
  }

  function assignBatchStudent(index, nextStudentId) {
    setBatch((current) => {
      if (!current) return current
      const item = current.items[index]
      const nextStudent = data.students.find((entry) => entry.id === nextStudentId)
      if (!item || item.error) return current
      if (!nextStudent) {
        const items = current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, identity: { ...entry.identity, studentId: null } } : entry)
        return { ...current, items }
      }
      const itemAssessment = data.assessments.find((entry) => entry.id === item.assessmentId) || assessment
      const nextKey = getAnswerKeyForStudent(itemAssessment, nextStudent)
      const regraded = regradeAnswers(item.answers, nextKey)
      const updated = {
        ...item,
        ...regraded,
        classId: nextStudent.classId,
        identity: { ...item.identity, studentId: nextStudent.id, assessmentId: itemAssessment.id },
      }
      return { ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? updated : entry) }
    })
  }

  function changeBatchAnswer(itemIndex, questionIndex, letter) {
    setBatch((current) => {
      if (!current) return current
      const item = current.items[itemIndex]
      if (!item?.answers) return current
      const itemAssessment = data.assessments.find((entry) => entry.id === item.assessmentId) || assessment
      const itemStudent = data.students.find((entry) => entry.id === item.identity?.studentId)
      const itemClassId = itemStudent?.classId || item.classId || classId
      const itemAnswerKey = itemStudent ? getAnswerKeyForStudent(itemAssessment, itemStudent) : getAnswerKeyForClass(itemAssessment, itemClassId)
      const changed = item.answers.map((answer, index) => index === questionIndex
        ? { ...answer, selected: letter ? [letter] : [], expected: itemAnswerKey[index], status: !letter ? 'blank' : letter === itemAnswerKey[index] ? 'correct' : 'wrong' }
        : answer)
      const updated = { ...item, ...regradeAnswers(changed, itemAnswerKey), classId: itemClassId }
      return { ...current, items: current.items.map((entry, index) => index === itemIndex ? updated : entry) }
    })
  }

  function openBatchPreview(index) {
    setBatchFilter('all')
    setBatchPreviewIndex(index)
  }

  function saveCorrection() {
    const finalStudent = data.students.find((item) => item.id === (result?.identity?.studentId || studentId))
    const finalAssessment = data.assessments.find((item) => item.id === result?.assessmentId)
    if (!finalStudent || !finalAssessment) {
      notify('Identificação incompleta', 'Selecione o aluno e o simulado corretos.', 'warning')
      return
    }
    if (!finalAssessment.classIds.includes(finalStudent.classId)) {
      notify('Turma incompatível', 'Este aluno não pertence a uma turma associada ao simulado.', 'warning')
      return
    }
    const finalVersion = getAnswerKeyVersionForStudent(finalAssessment, finalStudent)
    const finalKey = finalVersion?.answerKey || getAnswerKeyForClass(finalAssessment, finalStudent.classId)
    const graded = regradeAnswers(result.answers, finalKey)
    const needsReview = graded.multiple > 0 || graded.uncertain > 0 || result.markersFound < 4
    const submission = {
      id: uid('submission'), assessmentId: finalAssessment.id, studentId: finalStudent.id, classId: finalStudent.classId,
      status: needsReview ? 'Revisar' : 'Corrigido', ...graded,
      answerKeySnapshot: finalKey, answerKeyVersionId: finalVersion?.id, answerKeyVersionLabel: finalVersion?.label, confidence: result.confidence, markersFound: result.markersFound,
      reviewReasons: [
        ...(result.markersFound < 4 ? ['Marcadores incompletos'] : []),
        ...(graded.multiple > 0 ? ['Marcações múltiplas'] : []),
        ...(graded.uncertain > 0 ? ['Marcações incertas'] : []),
      ],
      correctedAt: new Date().toISOString(), filename: fileName,
    }
    setData((current) => ({
      ...current,
      submissions: [submission, ...current.submissions.filter((item) => !(item.assessmentId === finalAssessment.id && item.studentId === finalStudent.id))],
      assessments: current.assessments.map((item) => item.id === finalAssessment.id && item.status === 'Pronto para aplicar' ? { ...item, status: 'Correção em andamento' } : item),
    }))
    notify(needsReview ? 'Correção salva com ressalvas' : 'Folha corrigida e salva', needsReview ? 'As marcações ambíguas foram enviadas à fila de revisão.' : `${finalStudent.name}: ${graded.correct} acertos com o gabarito de ${data.classes.find((item) => item.id === finalStudent.classId)?.name}.`)
    setResult(null); setStudentId(''); setFileName('')
  }

  function saveBatchCorrections() {
    if (!batchSaveable.length) {
      notify('Nenhuma correção pronta', 'Identifique ao menos uma página antes de salvar o lote.', 'warning')
      return
    }
    const correctedAt = new Date().toISOString()
    const submissions = batchSaveable.map(({ item, student: finalStudent, assessment: finalAssessment, needsReview }) => {
      const finalVersion = getAnswerKeyVersionForStudent(finalAssessment, finalStudent)
      const finalKey = finalVersion?.answerKey || getAnswerKeyForClass(finalAssessment, finalStudent.classId)
      const graded = regradeAnswers(item.answers, finalKey)
      return {
        id: uid('submission'),
        assessmentId: finalAssessment.id,
        studentId: finalStudent.id,
        classId: finalStudent.classId,
        status: needsReview ? 'Revisar' : 'Corrigido',
        ...graded,
        answerKeySnapshot: finalKey,
        answerKeyVersionId: finalVersion?.id,
        answerKeyVersionLabel: finalVersion?.label,
        confidence: item.confidence,
        markersFound: item.markersFound,
        reviewReasons: [
          ...(item.markersFound < 4 ? ['Marcadores incompletos'] : []),
          ...(graded.multiple > 0 ? ['Marcações múltiplas'] : []),
          ...(graded.uncertain > 0 ? ['Marcações incertas'] : []),
        ],
        correctedAt,
        filename: `${batch.fileName} · página ${item.pageNumber}`,
        sourceType: 'pdf',
        sourcePage: item.pageNumber,
      }
    })
    const replacementKeys = new Set(submissions.map((item) => `${item.assessmentId}:${item.studentId}`))
    const touchedAssessments = new Set(submissions.map((item) => item.assessmentId))
    setData((current) => ({
      ...current,
      submissions: [
        ...submissions,
        ...current.submissions.filter((item) => !replacementKeys.has(`${item.assessmentId}:${item.studentId}`)),
      ],
      assessments: current.assessments.map((item) => touchedAssessments.has(item.id) && item.status === 'Pronto para aplicar' ? { ...item, status: 'Correção em andamento' } : item),
    }))
    const skippedMessage = batchUnresolved ? ` ${batchUnresolved} página(s) com pendência foram ignoradas.` : ''
    const reviewMessage = batchNeedsReview ? ` ${batchNeedsReview} correção(ões) foram enviadas para revisão.` : ''
    const replacementMessage = batchReplacements ? ` ${batchReplacements} resultado(s) anterior(es) foram atualizado(s).` : ''
    notify('Lote de correções salvo', `${submissions.length} correção(ões) registradas.${replacementMessage}${reviewMessage}${skippedMessage}`, batchUnresolved ? 'warning' : 'success')
    setBatch(null)
    setBatchPreviewIndex(null)
    setFileName('')
  }

  const visibleAnswers = result?.answers.filter((answer) => filter === 'all' || answer.status === filter) || []
  const resultReady = Boolean(result && detectedStudent && resultAssessment && resultClassCompatible)
  const resultNeedsReview = Boolean(result && (result.multiple > 0 || result.uncertain > 0 || result.markersFound < 4))
  const resultNoticeCount = result ? [
    !detectedStudent,
    !result.qrFound,
    detectedStudent && !resultClassCompatible,
    result.markersFound < 4,
    result.multiple > 0,
    result.uncertain > 0,
    Boolean(existingResultSubmission),
  ].filter(Boolean).length : 0

  return (
    <div className="page-stack correction-page">
      {!result && !batch && <div className="correction-tabs"><button className={tab === 'scan' ? 'active' : ''} onClick={() => setTab('scan')}><ScanLine size={17} /><span>Corrigir folhas<small>Imagem ou PDF em lote</small></span></button><button className={tab === 'keys' ? 'active' : ''} onClick={() => setTab('keys')}><ClipboardList size={17} /><span>Gabaritos por turma<small>Visualizar e editar</small></span></button><button className={tab === 'reviews' ? 'active' : ''} onClick={() => setTab('reviews')}><ListChecks size={17} /><span>Revisões<small>{data.submissions.filter((item) => item.status === 'Revisar').length} pendentes</small></span></button></div>}

      {!result && !batch && tab === 'keys' && <AnswerKeysPanel data={data} setData={setData} notify={notify} initialAssessmentId={assessmentId} />}
      {!result && !batch && tab === 'reviews' && <ReviewQueue data={data} setData={setData} notify={notify} />}

      {!result && !batch && tab === 'scan' && <>
        <div className="correction-layout">
          <section className="panel upload-panel">
            <div className="correction-step"><span>1</span><div><h3>Selecione o simulado e a turma</h3><p>O QR Code confirmará automaticamente essas informações na leitura.</p></div></div>
            <div className="correction-selectors"><label><span>Simulado</span><select value={assessmentId} onChange={(event) => chooseAssessment(event.target.value)}>{data.assessments.map((item) => <option value={item.id} key={item.id}>{item.title} · {item.questionCount} questões</option>)}</select></label><label><span>Turma / versão</span><select value={classId} onChange={(event) => { setClassId(event.target.value); setStudentId('') }}>{assessment?.classIds.map((id) => { const item = data.classes.find((entry) => entry.id === id); return <option value={id} key={id}>{item?.name} · {item?.shift}</option> })}</select></label></div>
            <div className="selected-key-preview"><div><span className="key-preview-icon"><ClipboardList size={18} /></span><p><small>GABARITO EM USO</small><strong>{classroom?.name} · {assessment?.code}</strong><em>{hasCustomAnswerKey(assessment, classId) ? 'Versão específica da turma' : 'Gabarito padrão'}</em></p></div><AnswerKeyStrip answerKey={answerKey} limit={12} compact /><button onClick={() => setTab('keys')}>Ver gabarito completo <ChevronRight size={14} /></button></div>

            <div className="correction-step second"><span>2</span><div><h3>Envie uma folha ou um PDF completo</h3><p>Cada página será identificada pelo QR e corrigida com o gabarito da turma correspondente.</p></div></div>
            <div className={cn('drop-zone', dragging && 'dragging', processing && 'processing')} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); processFile(event.dataTransfer.files[0]) }}>
              {processing ? <><span className="scan-animation"><ScanLine size={31} /><i /></span><h3>{processingProgress?.total ? `Analisando página ${processingProgress.current} de ${processingProgress.total}` : 'Preparando arquivo...'}</h3><p>Lendo QR Codes, identificando turmas e aplicando os gabaritos</p>{processingProgress?.total > 0 && <div className="batch-processing-progress"><i style={{ width: `${Math.round((processingProgress.current / processingProgress.total) * 100)}%` }} /></div>}</> : <><span className="upload-illustration"><Files size={28} /><i><QrCode size={16} /></i></span><h3>Arraste uma imagem ou PDF aqui</h3><p>JPG, PNG ou WEBP até 15 MB · PDF com até 100 páginas e 100 MB</p><div><Button icon={UploadCloud} onClick={() => fileInput.current?.click()}>Imagem ou PDF</Button><Button variant="secondary" icon={Camera} onClick={() => cameraInput.current?.click()}>Usar câmera</Button></div></>}
              <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf" hidden onChange={(event) => { processFile(event.target.files[0]); event.target.value = '' }} />
              <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { processFile(event.target.files[0]); event.target.value = '' }} />
            </div>
            <details className="manual-identification"><summary>QR Code danificado? Identificar manualmente <ChevronRight size={15} /></summary><div><select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Selecione o aluno (opcional)</option>{eligibleStudents.map((student) => <option value={student.id} key={student.id}>{student.name} · {student.registration}</option>)}</select></div></details>
          </section>

          <aside className="correction-guide"><h3>Para uma leitura precisa</h3><div><span><Focus size={19} /></span><p><strong>Uma folha por página</strong>No PDF, cada página deve conter uma folha completa, sem cortes.</p></div><div><span><CircleDot size={19} /></span><p><strong>Digitalize com nitidez</strong>Prefira 200 ou 300 DPI e mantenha os quatro marcadores visíveis.</p></div><div><span><QrCode size={19} /></span><p><strong>Não cubra o QR Code</strong>Ele relaciona cada página ao aluno, à turma e ao simulado.</p></div><div className="privacy-note"><CheckCircle2 size={18} /><p><strong>Processamento privado</strong>O PDF é analisado neste dispositivo e não é enviado para servidores.</p></div></aside>
        </div>

        <section className="panel recent-corrections"><header className="panel-header"><div><h3>Correções recentes</h3><p>Últimas folhas processadas e o gabarito aplicado</p></div><button className="text-button" onClick={() => setTab('reviews')}>{data.submissions.filter((item) => item.status === 'Revisar').length} para revisar <ChevronRight size={14} /></button></header>{recent.length ? <div className="table-wrap"><table><thead><tr><th>ALUNO</th><th>TURMA / GABARITO</th><th>SIMULADO</th><th>RESULTADO</th><th>STATUS</th><th /></tr></thead><tbody>{recent.map((submission) => { const itemStudent = data.students.find((item) => item.id === submission.studentId); const itemAssessment = data.assessments.find((item) => item.id === submission.assessmentId); const itemClass = data.classes.find((item) => item.id === itemStudent?.classId); return <tr key={submission.id}><td><strong>{itemStudent?.name || 'Aluno removido'}</strong><small className="cell-subtitle">{itemStudent?.registration}</small></td><td><span className="class-tag" style={{ '--class-color': itemClass?.color }}>{itemClass?.name}</span><small className="cell-subtitle">Gabarito {hasCustomAnswerKey(itemAssessment, itemStudent?.classId) ? 'específico' : 'padrão'}</small></td><td>{itemAssessment?.title}</td><td><strong>{submission.correct} / {itemAssessment?.questionCount}</strong><small className="cell-subtitle">{submission.score}% de acertos</small></td><td><Badge tone={submission.status === 'Revisar' ? 'ochre' : 'green'}>{submission.status}</Badge></td><td><button className="icon-button"><MoreHorizontal size={18} /></button></td></tr> })}</tbody></table></div> : <EmptyState icon={ScanLine} title="Nenhuma folha corrigida" description="As leituras aparecerão aqui." />}</section>
      </>}

      {batch && <section className="batch-review page-stack">
        <header className="scan-result-header">
          <div><button className="back-link" onClick={() => { setBatch(null); setBatchPreviewIndex(null); setFileName('') }}><X size={16} /> Descartar lote</button><h2>Revisão do PDF</h2><p>{batch.fileName} · {batch.totalPages} página(s) analisada(s)</p></div>
          <div className="scan-header-actions"><Button variant="secondary" icon={RotateCcw} onClick={() => { setBatch(null); setBatchPreviewIndex(null) }}>Escolher outro arquivo</Button><Button icon={Save} disabled={!batchSaveable.length} onClick={saveBatchCorrections}>Salvar {batchSaveable.length} correção(ões)</Button></div>
        </header>

        <div className="batch-summary-grid">
          <div><span className="batch-summary-icon blue"><FileText size={20} /></span><p><small>PÁGINAS</small><strong>{batch.totalPages}</strong></p></div>
          <div><span className="batch-summary-icon green"><CheckCircle2 size={20} /></span><p><small>PRONTAS PARA SALVAR</small><strong>{batchSaveable.length}</strong></p></div>
          <div><span className="batch-summary-icon ochre"><AlertTriangle size={20} /></span><p><small>IRÃO PARA REVISÃO</small><strong>{batchNeedsReview}</strong></p></div>
          <div><span className="batch-summary-icon red"><QrCode size={20} /></span><p><small>PENDÊNCIAS</small><strong>{batchUnresolved}</strong></p></div>
        </div>

        {batchUnresolved > 0 && <div className="batch-alert"><AlertTriangle size={18} /><p><strong>Existem páginas que não serão salvas ainda.</strong>Selecione manualmente o aluno quando o QR não for reconhecido. Páginas inválidas ou duplicadas serão ignoradas.</p></div>}
        {batchReplacements > 0 && <div className="scan-notice is-info"><RotateCcw size={17} /><p><strong>{batchReplacements} correção(ões) já existente(s).</strong> Esses resultados serão atualizados quando o lote for salvo; as demais correções permanecerão intactas.</p></div>}

        <section className="panel batch-performance-panel">
          <header className="panel-header"><div><h3>Resultado consolidado do lote</h3><p>Contagem de respostas das páginas prontas para salvar</p></div><Badge tone={batchTotals.multiple + batchTotals.uncertain ? 'ochre' : 'green'}>{batchTotals.total} respostas analisadas</Badge></header>
          <ResultBreakdown result={batchTotals} />
        </section>

        <section className="panel batch-results-panel">
          <header className="panel-header"><div><h3>Folhas encontradas</h3><p>Confira a identificação e o resultado de cada página antes de salvar.</p></div><Badge tone={batchUnresolved ? 'ochre' : 'green'}>{batchSaveable.length} de {batch.totalPages} prontas</Badge></header>
          <div className="table-wrap"><table className="batch-results-table"><thead><tr><th>PÁGINA</th><th>ALUNO</th><th>TURMA</th><th>SIMULADO</th><th>RESULTADO</th><th>LEITURA</th><th /></tr></thead><tbody>
            {batchRows.map((row) => {
              const availableStudents = data.students.filter((student) => row.assessment?.classIds.includes(student.classId) && student.status === 'Ativo')
              return <tr key={row.item.pageNumber} className={row.issue ? 'batch-row-issue' : ''}>
                <td><span className="batch-page-number">{row.item.pageNumber}</span></td>
                <td>{row.item.error ? <span className="batch-error-text">Página não processada</span> : <select className="batch-student-select" value={row.student?.id || ''} onChange={(event) => assignBatchStudent(row.index, event.target.value)}><option value="">Identificar aluno...</option>{availableStudents.map((student) => <option value={student.id} key={student.id}>{student.name} · {student.registration}</option>)}</select>}</td>
                <td>{row.classroom ? <span className="class-tag" style={{ '--class-color': row.classroom.color }}>{row.classroom.name}</span> : '—'}</td>
                <td><strong>{row.assessment?.code || '—'}</strong><small className="cell-subtitle">{row.assessment?.title || ''}</small></td>
                <td>{row.valid ? <div className="batch-result-cell"><strong>{row.item.score}%</strong><span><b className="is-correct">{row.item.correct} A</b><b className="is-wrong">{row.item.wrong} E</b><b>{row.item.blank} B</b><b className="is-review">{row.item.multiple + row.item.uncertain} R</b></span></div> : '—'}</td>
                <td>{row.issue ? <Badge tone={row.issue.includes('duplicada') || row.item.error ? 'red' : 'ochre'}>{row.issue}</Badge> : row.needsReview ? <Badge tone="ochre">Revisar marcações</Badge> : row.existingSubmission ? <Badge tone="blue">Atualizará existente</Badge> : <Badge tone="green">Pronta</Badge>}</td>
                <td><button className="icon-button" disabled={!row.item.previewUrl} onClick={() => openBatchPreview(row.index)} aria-label={`Visualizar página ${row.item.pageNumber}`} title="Ver identificação e respostas"><Eye size={17} /></button></td>
              </tr>
            })}
          </tbody></table></div>
        </section>
      </section>}

      {result && <section className="scan-result">
        <header className="scan-result-header">
          <div><button className="back-link" onClick={() => setResult(null)}><X size={16} /> Fechar leitura</button><h2>Conferência completa da folha</h2><p>{fileName} · confira a identificação e cada resposta antes de salvar</p></div>
          <div className="scan-header-actions"><Button variant="secondary" icon={RotateCcw} onClick={() => setResult(null)}>Escolher outro arquivo</Button><Button icon={Save} disabled={!resultReady} onClick={saveCorrection}>{existingResultSubmission ? 'Atualizar correção' : 'Confirmar correção'}</Button></div>
        </header>

        <div className="scan-photo-workspace">
          <aside className="image-preview-panel panel scan-photo-panel"><header><div><h3>Folha enviada</h3><p>Use a imagem como referência durante a conferência.</p></div><Badge tone={result.markersFound === 4 ? 'green' : 'ochre'}>{result.markersFound === 4 ? 'Enquadrada' : 'Enquadramento estimado'}</Badge></header><div className="scan-image"><img src={result.previewUrl} alt="Folha digitalizada" /><i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" /></div></aside>

          <aside className="scan-review-sidebar">
            <section className={cn('scan-verdict', !resultReady ? 'is-pending' : resultNeedsReview ? 'needs-review' : 'is-ready')}>
              <span>{!resultReady || resultNeedsReview ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}</span>
              <div><small>RESULTADO DA LEITURA</small><strong>{!resultReady ? 'Identificação pendente' : resultNeedsReview ? 'Confira os avisos abaixo' : 'Pronta para salvar'}</strong><p>{!resultReady ? 'Complete os dados para aplicar o gabarito correto.' : resultNeedsReview ? 'A nota foi calculada, mas há ocorrências para revisar.' : 'Aluno, prova e respostas foram reconhecidos.'}</p></div>
              <Badge tone={!resultReady || resultNeedsReview ? 'ochre' : 'green'}>{resultNoticeCount ? `${resultNoticeCount} aviso${resultNoticeCount !== 1 ? 's' : ''}` : 'Sem pendências'}</Badge>
            </section>

            <section className="panel scan-identity-panel">
              <header><h3>Identificação encontrada</h3><p>Dados usados para selecionar o gabarito</p></header>
              <div className={cn('scan-identity-row', !detectedStudent && 'identification-missing')}><span><UsersRound size={18} /></span><div><small>ALUNO</small><strong>{detectedStudent?.name || 'Não identificado'}</strong><p>{detectedStudent ? `Matrícula ${detectedStudent.registration}` : 'Selecione o aluno para continuar'}</p>{!detectedStudent && <select value={studentId} onChange={(event) => assignManualStudent(event.target.value)}><option value="">Selecionar aluno...</option>{resultEligibleStudents.map((student) => <option value={student.id} key={student.id}>{student.name} · {data.classes.find((item) => item.id === student.classId)?.name}</option>)}</select>}</div><Badge tone={detectedStudent && result.qrFound ? 'green' : 'ochre'}>{detectedStudent && result.qrFound ? 'QR' : detectedStudent ? 'Manual' : 'Pendente'}</Badge></div>
              <div className="scan-identity-row"><span><FileText size={18} /></span><div><small>SIMULADO / PROVA</small><strong>{resultAssessment?.title || 'Não encontrado'}</strong><p>{resultAssessment ? `${resultAssessment.code} · ${resultAssessment.questionCount} questões` : 'Confira o QR Code'}</p></div><Badge tone={result.qrFound && result.identity?.assessmentId === resultAssessment?.id ? 'green' : 'blue'}>{result.qrFound && result.identity?.assessmentId === resultAssessment?.id ? 'QR' : 'Selecionada'}</Badge></div>
              <div className={cn('scan-identity-row', detectedStudent && !resultClassCompatible && 'identification-missing')}><span><ClipboardList size={18} /></span><div><small>TURMA / GABARITO</small><strong>{resultClassroom?.name || 'Turma não definida'}</strong><p>{resultClassroom ? `${resultClassroom.shift} · ${hasCustomAnswerKey(resultAssessment, resultClassId) ? 'versão específica' : 'versão padrão'}` : 'Gabarito não definido'}</p></div><Badge tone={resultClassCompatible ? 'green' : 'ochre'}>{resultClassCompatible ? 'Compatível' : 'Conferir'}</Badge></div>
              <div className="scan-identity-row"><span><ScanLine size={18} /></span><div><small>QUALIDADE</small><strong>{result.confidence}% de confiança</strong><p>QR {result.qrFound ? 'lido' : 'não lido'} · {result.markersFound}/4 marcadores</p></div><Badge tone={result.qrFound && result.markersFound === 4 ? 'green' : 'ochre'}>{result.markersFound === 4 ? 'Boa' : 'Estimada'}</Badge></div>
            </section>

            <ResultBreakdown result={result} compact />

            <div className="scan-notice-stack compact-notices">
              {!detectedStudent && <div className="scan-notice is-warning"><UsersRound size={17} /><p><strong>Aluno não encontrado.</strong> Faça a identificação manual acima.</p></div>}
              {!result.qrFound && <div className="scan-notice is-warning"><QrCode size={17} /><p><strong>QR não reconhecido.</strong> A prova selecionada foi usada como referência.</p></div>}
              {detectedStudent && !resultClassCompatible && <div className="scan-notice is-error"><AlertTriangle size={17} /><p><strong>Turma incompatível.</strong> Este aluno não pertence às turmas do simulado.</p></div>}
              {result.markersFound < 4 && <div className="scan-notice is-warning"><Focus size={17} /><p><strong>Enquadramento estimado.</strong> {result.markersFound} de 4 marcadores encontrados.</p></div>}
              {result.multiple > 0 && <div className="scan-notice is-error"><CircleDot size={17} /><p><strong>{result.multiple} múltipla(s).</strong> Mais de uma alternativa detectada.</p></div>}
              {result.uncertain > 0 && <div className="scan-notice is-warning"><AlertTriangle size={17} /><p><strong>{result.uncertain} incerta(s).</strong> Confira as marcações destacadas.</p></div>}
              {existingResultSubmission && <div className="scan-notice is-info"><RotateCcw size={17} /><p><strong>Já existe uma correção.</strong> O resultado anterior será substituído.</p></div>}
              {!resultNoticeCount && <div className="scan-notice is-success"><CheckCircle2 size={17} /><p><strong>Nenhuma inconsistência encontrada.</strong></p></div>}
            </div>
          </aside>
        </div>

        <div className="applied-key-banner"><ClipboardList size={17} /><div><strong>Gabarito aplicado: {resultAssessment?.title} · {resultClassroom?.name}</strong><p>{resultAnswerKeyVersion?.label || (hasCustomAnswerKey(resultAssessment, resultClassId) ? 'Versão específica desta turma' : 'Gabarito padrão do simulado')}</p></div><AnswerKeyStrip answerKey={resultAnswerKey} limit={10} compact /></div>

        <div className="answer-review-panel panel scan-answer-review">
          <header className="answer-review-heading"><div><h3>Respostas encontradas</h3><p>Filtre os resultados ou clique em uma alternativa para corrigir a leitura.</p></div><Badge tone={result.multiple + result.uncertain ? 'ochre' : 'green'}>{result.answers.length} questões</Badge></header>
          <div className="answer-filters"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todas <span>{result.answers.length}</span></button><button className={filter === 'correct' ? 'active' : ''} onClick={() => setFilter('correct')}>Acertos <span>{result.correct}</span></button><button className={filter === 'wrong' ? 'active' : ''} onClick={() => setFilter('wrong')}>Erros <span>{result.wrong}</span></button><button className={filter === 'blank' ? 'active' : ''} onClick={() => setFilter('blank')}>Em branco <span>{result.blank}</span></button><button className={filter === 'multiple' ? 'active' : ''} onClick={() => setFilter('multiple')}>Múltiplas <span>{result.multiple}</span></button><button className={filter === 'uncertain' ? 'active' : ''} onClick={() => setFilter('uncertain')}>Incertas <span>{result.uncertain}</span></button></div>
          <DetailedAnswerList answers={visibleAnswers} assessment={resultAssessment} questionAreas={resultQuestionAreas} onChange={changeAnswer} />
        </div>
      </section>}

      <Modal open={Boolean(batchPreview)} onClose={() => setBatchPreviewIndex(null)} title={`Conferência da página ${batchPreview?.item.pageNumber || ''}`} subtitle="Confira a identificação, o resultado e as respostas antes de salvar o lote." size="xl" footer={<Button onClick={() => setBatchPreviewIndex(null)}>Concluir conferência</Button>}>
        {batchPreview?.item.previewUrl && <div className="batch-page-detail">
          <div className="batch-preview-identification">
            <article><small>ALUNO</small><strong>{batchPreview.student?.name || 'Não identificado'}</strong><p>{batchPreview.student ? `Matrícula ${batchPreview.student.registration}` : 'Selecione um aluno para salvar esta página'}</p>{!batchPreview.student && !batchPreview.item.error && <select value="" onChange={(event) => assignBatchStudent(batchPreview.index, event.target.value)}><option value="">Selecionar aluno...</option>{batchPreviewEligibleStudents.map((student) => <option value={student.id} key={student.id}>{student.name} · {student.registration}</option>)}</select>}</article>
            <article><small>SIMULADO / PROVA</small><strong>{batchPreview.assessment?.title || 'Não encontrado'}</strong><p>{batchPreview.assessment ? `${batchPreview.assessment.code} · ${batchPreview.assessment.questionCount} questões` : 'Identificação indisponível'}</p></article>
            <article><small>TURMA / GABARITO</small><strong>{batchPreview.classroom?.name || 'Não definida'}</strong><p>{batchPreview.classroom ? `${batchPreview.classroom.shift} · ${hasCustomAnswerKey(batchPreview.assessment, batchPreview.classroom.id) ? 'versão específica' : 'versão padrão'}` : 'Aguardando identificação do aluno'}</p></article>
            <article><small>QUALIDADE</small><strong>{batchPreview.item.confidence}% de confiança</strong><p>QR {batchPreview.item.qrFound ? 'lido' : 'não lido'} · {batchPreview.item.markersFound}/4 marcadores</p></article>
          </div>

          {batchPreview.issue && <div className="scan-notice is-error"><AlertTriangle size={17} /><p><strong>Pendência nesta página.</strong> {batchPreview.issue}. Ela não será salva enquanto a pendência existir.</p></div>}
          {!batchPreview.issue && batchPreview.needsReview && <div className="scan-notice is-warning"><AlertTriangle size={17} /><p><strong>Esta página requer revisão.</strong> Confira as marcações múltiplas, incertas ou o enquadramento antes de salvar.</p></div>}
          {!batchPreview.issue && batchPreview.existingSubmission && <div className="scan-notice is-info"><RotateCcw size={17} /><p><strong>Já existe uma correção deste aluno.</strong> O resultado anterior será substituído ao salvar o lote.</p></div>}

          {batchPreview.item.answers && <ResultBreakdown result={batchPreview.item} />}

          <div className="batch-page-review-grid">
            <div className="batch-preview-image"><img src={batchPreview.item.previewUrl} alt={`Página ${batchPreview.item.pageNumber} do PDF`} /></div>
            {batchPreview.item.answers && batchPreview.assessment && <div className="answer-review-panel panel">
              <header className="answer-review-heading"><div><h3>Respostas da página</h3><p>Você pode ajustar a alternativa antes de fechar.</p></div><Badge tone={batchPreview.needsReview ? 'ochre' : 'green'}>{batchPreview.item.answers.length} questões</Badge></header>
              <div className="answer-filters"><button className={batchFilter === 'all' ? 'active' : ''} onClick={() => setBatchFilter('all')}>Todas <span>{batchPreview.item.answers.length}</span></button><button className={batchFilter === 'correct' ? 'active' : ''} onClick={() => setBatchFilter('correct')}>Acertos <span>{batchPreview.item.correct}</span></button><button className={batchFilter === 'wrong' ? 'active' : ''} onClick={() => setBatchFilter('wrong')}>Erros <span>{batchPreview.item.wrong}</span></button><button className={batchFilter === 'blank' ? 'active' : ''} onClick={() => setBatchFilter('blank')}>Brancos <span>{batchPreview.item.blank}</span></button><button className={batchFilter === 'multiple' ? 'active' : ''} onClick={() => setBatchFilter('multiple')}>Múltiplas <span>{batchPreview.item.multiple}</span></button><button className={batchFilter === 'uncertain' ? 'active' : ''} onClick={() => setBatchFilter('uncertain')}>Incertas <span>{batchPreview.item.uncertain}</span></button></div>
              <DetailedAnswerList answers={visibleBatchAnswers} assessment={batchPreview.assessment} questionAreas={batchPreviewAreas} onChange={(questionIndex, letter) => changeBatchAnswer(batchPreview.index, questionIndex, letter)} />
            </div>}
          </div>
        </div>}
      </Modal>
    </div>
  )
}
