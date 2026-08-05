import { useMemo, useState } from 'react'
import { Plus, Search, SlidersHorizontal, UsersRound, MoreHorizontal, UserPlus, Download, ChevronRight, Database, X } from 'lucide-react'
import { Badge, Button, Field, Modal } from '../components/ui'
import { classColors } from '../data'
import { cn, downloadBlob, initials, normalize, uid } from '../lib/utils'

export function PeoplePage({ data, setData, setPage, notify, initialSearch }) {
  const rememberedSearch = sessionStorage.getItem('luma-search') || ''
  const [search, setSearch] = useState(rememberedSearch || initialSearch || '')
  const [selectedClass, setSelectedClass] = useState('all')
  const [tab, setTab] = useState('students')
  const [studentModal, setStudentModal] = useState(false)
  const [classModal, setClassModal] = useState(false)

  const students = useMemo(() => data.students.filter((student) => {
    const matchesClass = selectedClass === 'all' || student.classId === selectedClass
    const query = normalize(search)
    return matchesClass && (!query || normalize(`${student.name} ${student.registration}`).includes(query))
  }), [data.students, search, selectedClass])

  function addStudent(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const registration = String(form.get('registration')).trim()
    if (data.students.some((student) => normalize(student.registration) === normalize(registration))) {
      notify('Matrícula já cadastrada', 'Use outra matrícula ou atualize o aluno existente.', 'warning')
      return
    }
    const student = {
      id: uid('student'), name: String(form.get('name')).trim(), registration,
      classId: String(form.get('classId')), status: 'Ativo', source: 'Manual', updatedAt: new Date().toISOString(),
    }
    setData((current) => ({ ...current, students: [...current.students, student] }))
    setStudentModal(false)
    notify('Aluno adicionado', `${student.name} já aparece na turma.`)
  }

  function addClass(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const classroom = {
      id: uid('class'), name: String(form.get('name')).trim(), grade: String(form.get('grade')).trim(),
      shift: String(form.get('shift')), year: Number(form.get('year')), color: classColors[data.classes.length % classColors.length],
    }
    setData((current) => ({ ...current, classes: [...current.classes, classroom] }))
    setClassModal(false)
    notify('Turma criada', `${classroom.name} está pronta para receber alunos.`)
  }

  function exportStudents() {
    const header = ['Matrícula', 'Nome', 'Turma', 'Série', 'Turno', 'Situação', 'Origem']
    const lines = students.map((student) => {
      const classroom = data.classes.find((item) => item.id === student.classId)
      return [student.registration, student.name, classroom?.name, classroom?.grade, classroom?.shift, student.status, student.source]
    })
    const csv = [header, ...lines].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\n')
    downloadBlob(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }), 'alunos-sistema-avaliacoes.csv')
  }

  return (
    <div className="page-stack">
      <div className="page-actions-row">
        <div className="segmented-tabs">
          <button className={cn(tab === 'students' && 'active')} onClick={() => setTab('students')}>Alunos <span>{data.students.length}</span></button>
          <button className={cn(tab === 'classes' && 'active')} onClick={() => setTab('classes')}>Turmas <span>{data.classes.length}</span></button>
        </div>
        <div className="right-actions">
          <Button variant="secondary" icon={Download} onClick={exportStudents}>Exportar</Button>
          <Button variant="secondary" icon={Database} onClick={() => setPage('import')}>Importar SEGES</Button>
          <Button icon={tab === 'students' ? UserPlus : Plus} onClick={() => tab === 'students' ? setStudentModal(true) : setClassModal(true)}>{tab === 'students' ? 'Adicionar aluno' : 'Nova turma'}</Button>
        </div>
      </div>

      {tab === 'students' ? (
        <section className="panel people-panel">
          <div className="filter-bar">
            <label className="search-input"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou matrícula" />{search && <button onClick={() => setSearch('')}><X size={14} /></button>}</label>
            <select value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}>
              <option value="all">Todas as turmas</option>
              {data.classes.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.shift}</option>)}
            </select>
            <button className="filter-button"><SlidersHorizontal size={16} /> Mais filtros</button>
            <span className="result-count">{students.length} resultado{students.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="table-wrap">
            <table className="student-table">
              <thead><tr><th>ALUNO</th><th>MATRÍCULA</th><th>TURMA</th><th>TURNO</th><th>ORIGEM</th><th>SITUAÇÃO</th><th /></tr></thead>
              <tbody>
                {students.map((student, index) => {
                  const classroom = data.classes.find((item) => item.id === student.classId)
                  return (
                    <tr key={student.id}>
                      <td><div className="student-name"><span style={{ background: `${classroom?.color}1c`, color: classroom?.color }}>{initials(student.name)}</span><div><strong>{student.name}</strong><small>{student.id}</small></div></div></td>
                      <td className="mono-cell">{student.registration}</td>
                      <td><span className="class-tag" style={{ '--class-color': classroom?.color }}>{classroom?.name}</span></td>
                      <td>{classroom?.shift}</td>
                      <td><Badge tone={student.source === 'SEGES' ? 'blue' : 'neutral'}>{student.source}</Badge></td>
                      <td><Badge tone={student.status === 'Ativo' ? 'green' : 'neutral'} dot>{student.status}</Badge></td>
                      <td><button className="icon-button"><MoreHorizontal size={18} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="class-grid">
          {data.classes.map((classroom) => {
            const members = data.students.filter((student) => student.classId === classroom.id && student.status === 'Ativo')
            const assessments = data.assessments.filter((assessment) => assessment.classIds.includes(classroom.id))
            return (
              <article className="class-card" key={classroom.id}>
                <div className="class-card-top" style={{ '--class-color': classroom.color }}><span><UsersRound size={21} /></span><button className="icon-button"><MoreHorizontal size={18} /></button></div>
                <h3>{classroom.name}</h3><p>{classroom.grade} · {classroom.shift}</p>
                <div className="class-stats"><span><strong>{members.length}</strong> alunos ativos</span><span><strong>{assessments.length}</strong> simulados</span></div>
                <div className="avatar-stack">{members.slice(0, 5).map((student) => <i key={student.id}>{initials(student.name)}</i>)}{members.length > 5 && <em>+{members.length - 5}</em>}</div>
                <button className="class-open" onClick={() => { setTab('students'); setSelectedClass(classroom.id) }}>Ver alunos <ChevronRight size={16} /></button>
              </article>
            )
          })}
          <button className="new-class-card" onClick={() => setClassModal(true)}><span><Plus size={23} /></span><strong>Criar nova turma</strong><small>Adicione alunos manualmente ou pelo SEGES</small></button>
        </div>
      )}

      <Modal open={studentModal} onClose={() => setStudentModal(false)} title="Adicionar aluno" subtitle="Use este cadastro para exceções; para listas completas, prefira o SEGES." footer={<><Button variant="ghost" onClick={() => setStudentModal(false)}>Cancelar</Button><Button type="submit" form="student-form">Adicionar aluno</Button></>}>
        <form id="student-form" onSubmit={addStudent} className="form-grid">
          <Field label="Nome completo" required><input name="name" required placeholder="Ex.: Ana Clara dos Santos" /></Field>
          <Field label="Matrícula" required><input name="registration" required placeholder="Código do SEGES ou interno" /></Field>
          <Field label="Turma" required><select name="classId" required defaultValue=""><option value="" disabled>Selecione</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.shift}</option>)}</select></Field>
        </form>
      </Modal>

      <Modal open={classModal} onClose={() => setClassModal(false)} title="Criar turma" subtitle="A turma poderá receber simulados próprios ou compartilhados." footer={<><Button variant="ghost" onClick={() => setClassModal(false)}>Cancelar</Button><Button type="submit" form="class-form">Criar turma</Button></>}>
        <form id="class-form" onSubmit={addClass} className="form-grid two-columns">
          <Field label="Nome da turma" required><input name="name" required placeholder="Ex.: 8º A" /></Field>
          <Field label="Ano letivo" required><input type="number" name="year" required defaultValue="2026" /></Field>
          <Field label="Série / etapa" required><input name="grade" required placeholder="Ex.: 8º ano" /></Field>
          <Field label="Turno" required><select name="shift" defaultValue="Matutino"><option>Matutino</option><option>Vespertino</option><option>Noturno</option><option>Integral</option></select></Field>
        </form>
      </Modal>
    </div>
  )
}
