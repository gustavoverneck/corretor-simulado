import { useEffect, useMemo, useState } from 'react'
import { Ban, BookOpenCheck, ListChecks } from 'lucide-react'
import { Badge, Button, Modal } from './ui'
import { cn } from '../lib/utils'
import { calculateAreaResults } from '../lib/results'
import { ANSWER_STATUS_LABELS, buildStudentResult } from '../lib/studentResult'
import { describeVoid, isSubmissionVoided } from '../lib/voidedSubmission'

const questionFilters = [
  { id: 'all', label: 'Todas' },
  { id: 'correct', label: 'Acertos', match: (question) => question.outcome === 'correct' || question.outcome === 'annulled' },
  { id: 'wrong', label: 'Erros', match: (question) => question.outcome === 'wrong' || question.outcome === 'multiple' },
  { id: 'blank', label: 'Em branco', match: (question) => question.outcome === 'blank' },
  { id: 'review', label: 'Revisar', match: (question) => question.outcome === 'uncertain' },
]

function markedLabel(question) {
  return question.selected.length ? question.selected.join('+') : '—'
}

export function StudentResultModal({ row, studentRows = [], peerRows = [], areaColors = [], onSelectRow, onClose }) {
  const [areaFilter, setAreaFilter] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  useEffect(() => { setAreaFilter(null); setStatusFilter('all') }, [row?.id])

  const result = useMemo(() => buildStudentResult(row, row?.assessment), [row])
  const classAreaScores = useMemo(() => {
    if (!row) return new Map()
    const peers = peerRows.filter((item) => item.assessmentId === row.assessmentId && item.classId === row.classId)
    return new Map(calculateAreaResults([row.assessment], peers).filter((item) => item.attempts).map((item) => [item.area, item.score]))
  }, [peerRows, row])

  if (!row) return null
  const student = row.student
  const activeFilter = questionFilters.find((item) => item.id === statusFilter)
  const visibleQuestions = result?.questions.filter((question) => (!areaFilter || question.area === areaFilter) && (!activeFilter.match || activeFilter.match(question))) || []
  const groupedQuestions = (result?.areas || [])
    .map((area) => ({ area: area.area, questions: visibleQuestions.filter((question) => question.area === area.area) }))
    .filter((group) => group.questions.length)
  const areaColor = (area) => areaColors[(result?.areas.findIndex((item) => item.area === area) ?? 0) % Math.max(1, areaColors.length)]

  return <Modal open onClose={onClose} size="lg" title={student?.name || 'Aluno removido'} subtitle={[row.classroom?.name, student?.registration && `Matrícula ${student.registration}`, row.assessment.title, result?.versionLabel].filter(Boolean).join(' · ')} footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}>
    <div className="student-result">
      {studentRows.length > 1 && <div className="chart-view-toggle student-result-assessments" role="group" aria-label="Simulados do aluno">{studentRows.map((item) => <button type="button" key={item.id} className={item.id === row.id ? 'active' : ''} aria-pressed={item.id === row.id} title={isSubmissionVoided(item) ? `${item.assessment.title} (anulada)` : item.assessment.title} onClick={() => onSelectRow(item)}>{item.assessment.code || item.assessment.title}{isSubmissionVoided(item) ? ' · anulada' : ''}</button>)}</div>}

      {isSubmissionVoided(row) && <div className="voided-exam-banner student-result-voided" role="status"><span><Ban size={18} /></span><div><strong>Prova anulada · {describeVoid(row.voided)}</strong><p>As respostas abaixo ficam só para consulta: a nota vai como zero nas exportações e a prova fica fora das médias desta tela. Para desfazer, abra a folha em Correção → Respostas.</p></div></div>}
      {!result ? <div className="area-analysis-empty"><ListChecks size={24} /><div><strong>Correção sem respostas detalhadas</strong><p>Esta folha foi registrada apenas com o total: {row.correct} acertos de {row.total} questões ({row.score}%). Corrija a folha novamente para ver questão por questão.</p></div></div> : <>
        <div className="student-result-summary">
          <div><b>{result.totals.score}%</b><small>aproveitamento</small></div>
          <div><b>{result.totals.correct}<span>/{result.totals.total}</span></b><small>acertos</small></div>
          <div><b>{result.totals.wrong}</b><small>erros</small></div>
          <div><b>{result.totals.blank}</b><small>em branco</small></div>
          {result.totals.review > 0 && <div><b>{result.totals.review}</b><small>para revisar</small></div>}
          {result.totals.cancelled > 0 && <div><b>{result.totals.cancelled}</b><small>canceladas</small></div>}
        </div>

        <section className="student-result-section">
          <header><h4>Por área</h4><small>Clique em uma área para ver só as questões dela. O traço marca a média da turma.</small></header>
          <div className="student-area-list">{result.areas.map((area) => {
            const classScore = classAreaScores.get(area.area)
            const selected = areaFilter === area.area
            return <button type="button" key={area.area} className={cn('student-area-row', selected && 'selected')} aria-pressed={selected} onClick={() => setAreaFilter(selected ? null : area.area)}>
              <span className="area-performance-icon" style={{ '--area-color': areaColor(area.area) }}><BookOpenCheck size={16} /></span>
              <span className="student-area-copy"><strong>{area.area}</strong><small>{area.correct} {area.correct === 1 ? 'acerto' : 'acertos'} em {area.total} {area.total === 1 ? 'questão' : 'questões'}{area.cancelled ? ` · ${area.cancelled} cancelada${area.cancelled !== 1 ? 's' : ''}` : ''}</small></span>
              <span className="student-area-bar"><span><i style={{ width: `${area.score}%`, background: areaColor(area.area) }} />{classScore !== undefined && <em style={{ left: `${classScore}%` }} title={`Média da turma: ${classScore}%`} />}</span><strong>{area.score}%</strong></span>
              <small className="student-area-class">{classScore !== undefined ? `Média da turma ${classScore}%` : ''}</small>
            </button>
          })}</div>
        </section>

        <section className="student-result-section">
          <header><h4>Questões</h4><div className="chart-view-toggle" role="group" aria-label="Filtrar questões">{questionFilters.map((item) => <button type="button" key={item.id} className={statusFilter === item.id ? 'active' : ''} aria-pressed={statusFilter === item.id} onClick={() => setStatusFilter(item.id)}>{item.label}</button>)}</div></header>
          <div className="student-question-legend"><span className="q-correct">Acerto</span><span className="q-wrong">Erro</span><span className="q-blank">Em branco</span><span className="q-uncertain">Revisar</span><span className="q-annulled">Anulada</span><span className="q-cancelled">Cancelada</span></div>
          {areaFilter && <p className="student-question-scope">Mostrando {areaFilter}. <button type="button" onClick={() => setAreaFilter(null)}>Ver todas as áreas</button></p>}
          {groupedQuestions.length ? groupedQuestions.map((group) => <div className="student-question-group" key={group.area}>
            {!areaFilter && result.areas.length > 1 && <h5><i style={{ background: areaColor(group.area) }} />{group.area}</h5>}
            <div className="student-question-grid">{group.questions.map((question) => <div key={question.index} className={cn('student-question-tile', `q-${question.outcome}`)} title={`Questão ${question.number} · ${ANSWER_STATUS_LABELS[question.outcome]} · marcou ${markedLabel(question)}${question.expected ? ` · gabarito ${question.expected}` : ''}`}>
              <small>Q{question.number}</small>
              <strong>{markedLabel(question)}</strong>
              <span>{question.outcome === 'cancelled' ? 'cancelada' : question.outcome === 'annulled' ? 'anulada' : question.outcome === 'correct' ? 'certa' : `gab. ${question.expected || '—'}`}</span>
            </div>)}</div>
          </div>) : <p className="student-question-scope">Nenhuma questão neste filtro.</p>}
        </section>
      </>}
      {row.status === 'Revisar' && !isSubmissionVoided(row) && <Badge tone="ochre">Esta folha ainda tem revisão pendente na Correção.</Badge>}
    </div>
  </Modal>
}
