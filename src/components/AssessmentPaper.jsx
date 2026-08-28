import katex from 'katex'
import 'katex/dist/katex.min.css'
import { getAnswerKeyVersionForStudent } from '../lib/assessment'

function LatexText({ value }) {
  const parts = String(value || '').split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g).filter(Boolean)
  return <>{parts.map((part, index) => { const display = part.startsWith('$$'); const inline = !display && part.startsWith('$'); if (!display && !inline) return <span key={index}>{part}</span>; const expression = part.slice(display ? 2 : 1, display ? -2 : -1); try { return <span key={index} className={display ? 'latex-display' : 'latex-inline'} dangerouslySetInnerHTML={{ __html: katex.renderToString(expression, { displayMode: display, throwOnError: false, strict: false }) }} /> } catch { return <span key={index}>{part}</span> } })}</>
}

export function AssessmentPapers({ students, assessment, classes, school }) {
  return <div className="assessment-papers">{students.map((student) => { const version = getAnswerKeyVersionForStudent(assessment, student); const questions = version?.questions || assessment.questions || []; const classroom = classes.find((item) => item.id === student.classId); return <section className="assessment-paper" key={student.id}><header><div><strong>{school.name}</strong><span>{assessment.subjects.join(' · ')}</span></div><em>{assessment.code}</em></header><h1>{assessment.title}</h1><div className="assessment-paper-student"><span><b>Aluno:</b> {student.name}</span><span><b>Turma:</b> {classroom?.name}</span><span><b>Versão:</b> {version?.label || 'A'}</span></div><ol>{questions.map((question, index) => <li key={`${question.id}-${index}`}><div className="paper-statement"><LatexText value={question.statement} /></div>{question.image && <img src={question.image} alt="" />}<ol type="A">{question.alternatives.map((alternative, optionIndex) => <li key={optionIndex}><LatexText value={alternative} /></li>)}</ol></li>)}</ol><footer>{assessment.title} · {student.name} · {version?.label || 'Versão A'}</footer></section> })}</div>
}
