import { Fragment } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { getAnswerKeyVersionForStudent } from '../lib/assessment'
import { formatImageSource, getPrintableQuestions } from '../lib/fullAssessment'
import { AnswerSheet } from './AnswerSheet'

function LatexText({ value }) {
  const parts = String(value || '').split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g).filter(Boolean)
  return <>{parts.map((part, index) => { const display = part.startsWith('$$'); const inline = !display && part.startsWith('$'); if (!display && !inline) return <span key={index}>{part}</span>; const expression = part.slice(display ? 2 : 1, display ? -2 : -1); try { return <span key={index} className={display ? 'latex-display' : 'latex-inline'} dangerouslySetInnerHTML={{ __html: katex.renderToString(expression, { displayMode: display, throwOnError: false, strict: false }) }} /> } catch { return <span key={index}>{part}</span> } })}</>
}

function QuestionFigure({ question, index }) {
  if (!question.image) return null
  const source = formatImageSource(question.imageSource)
  const width = Math.min(100, Math.max(20, Number(question.imageWidth) || 60))
  return <><figure className="paper-question-figure" style={{ width: `${width}%` }}><img src={question.image} alt={question.imageName ? `Ilustração: ${question.imageName}` : `Ilustração da questão ${index + 1}`} />{source && <figcaption>{source}</figcaption>}</figure>{question.postImageText && <div className="paper-post-image-text"><LatexText value={question.postImageText} /></div>}</>
}

export function AssessmentPaper({ student, assessment, classroom, school }) {
  const version = getAnswerKeyVersionForStudent(assessment, student)
  const questions = getPrintableQuestions(assessment, version)

  return <section className="assessment-paper"><header><div><strong>{school.name}</strong><span>{assessment.subjects.join(' · ')}</span></div><em>{assessment.code}</em></header><h1>{assessment.title}</h1><div className="assessment-paper-student"><span><b>Aluno:</b> {student.name}</span><span><b>Turma:</b> {classroom?.name}</span><span><b>Versão:</b> {version?.label || 'A'}</span></div><ol>{questions.map((question, index) => <li key={`${question.id}-${index}`}><div className="paper-statement"><LatexText value={question.statement} /></div><QuestionFigure question={question} index={index} /><ol type="A">{question.alternatives.map((alternative, optionIndex) => <li key={optionIndex}><LatexText value={alternative} /></li>)}</ol></li>)}</ol><footer>{assessment.title} · {student.name} · {version?.label || 'Versão A'}</footer></section>
}

export function AssessmentPackets({ students, assessment, classes, school, hideRegistration = false }) {
  return (
    <div className="assessment-packets">
      {students.map((student) => {
        const classroom = classes.find((item) => item.id === student.classId)
        return (
          <Fragment key={student.id}>
            <div className="print-page">
              <AnswerSheet student={student} assessment={assessment} classroom={classroom} school={school} hideRegistration={hideRegistration} />
            </div>
            <AssessmentPaper student={student} assessment={assessment} classroom={classroom} school={school} />
          </Fragment>
        )
      })}
    </div>
  )
}
