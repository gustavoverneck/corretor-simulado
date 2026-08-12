import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, Search, SlidersHorizontal, UsersRound, MoreHorizontal, UserPlus, Download,
  ChevronRight, Database, X, Pencil, Trash2, AlertTriangle, FileSpreadsheet,
  UploadCloud, RefreshCw, FileCheck2, ClipboardPaste,
} from 'lucide-react'
import { Badge, Button, Field, Modal } from '../components/ui'
import { classColors } from '../data'
import { readPastedTable, readSegesFile } from '../lib/seges'
import { cn, downloadBlob, initials, nextStudentRegistration, normalize, uid } from '../lib/utils'

function suggestStudentNameColumn(headers) {
  return headers.find((header) => {
    const normalized = normalize(header)
    return ['nome', 'aluno', 'estudante', 'nome do aluno', 'nome completo'].includes(normalized)
  }) || headers.find((header) => /nome|aluno|estudante/.test(normalize(header))) || (headers.length === 1 ? headers[0] : '')
}

export function PeoplePage({ data, setData, setPage, notify, initialSearch }) {
  const studentImportInputRef = useRef(null)
  const rememberedSearch = sessionStorage.getItem('luma-search') || ''
  const [search, setSearch] = useState(rememberedSearch || initialSearch || '')
  const [selectedClass, setSelectedClass] = useState('all')
  const [tab, setTab] = useState('students')
  const [studentModal, setStudentModal] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
  const [openStudentMenu, setOpenStudentMenu] = useState(null)
  const [studentToDelete, setStudentToDelete] = useState(null)
  const [classModal, setClassModal] = useState(false)
  const [editingClass, setEditingClass] = useState(null)
  const [openClassMenu, setOpenClassMenu] = useState(null)
  const [classToDelete, setClassToDelete] = useState(null)
  const [studentImportClass, setStudentImportClass] = useState(null)
  const [studentImportFile, setStudentImportFile] = useState(null)
  const [studentImportColumn, setStudentImportColumn] = useState('')
  const [studentImportLoading, setStudentImportLoading] = useState(false)

  const students = useMemo(() => data.students.filter((student) => {
    const matchesClass = selectedClass === 'all' || student.classId === selectedClass
    const query = normalize(search)
    return matchesClass && (!query || normalize(`${student.name} ${student.registration}`).includes(query))
  }), [data.students, search, selectedClass])

  const studentImportRows = useMemo(() => {
    if (!studentImportFile || !studentImportColumn || !studentImportClass) return []
    const knownNames = new Set(data.students
      .filter((student) => student.classId === studentImportClass.id)
      .map((student) => normalize(student.name)))

    return studentImportFile.rows.map((row, index) => {
      const name = String(row[studentImportColumn] ?? '').trim()
      if (!name) return { index, name, status: 'blank' }
      const key = normalize(name)
      if (!key || knownNames.has(key)) return { index, name, status: 'duplicate' }
      knownNames.add(key)
      return { index, name, status: 'ready' }
    })
  }, [data.students, studentImportClass, studentImportColumn, studentImportFile])

  const readyStudentImportRows = studentImportRows.filter((row) => row.status === 'ready')

  useEffect(() => {
    if (!openClassMenu && !openStudentMenu) return undefined

    const closeMenu = (event) => {
      if (!event.target.closest('.class-card-menu')) setOpenClassMenu(null)
      if (!event.target.closest('.student-row-menu') && !event.target.closest('.student-row-menu-popover')) setOpenStudentMenu(null)
    }
    const closeMenuWithKeyboard = (event) => {
      if (event.key === 'Escape') {
        setOpenClassMenu(null)
        setOpenStudentMenu(null)
      }
    }
    const closeStudentMenuOnViewportChange = () => setOpenStudentMenu(null)

    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeMenuWithKeyboard)
    window.addEventListener('resize', closeStudentMenuOnViewportChange)
    window.addEventListener('scroll', closeStudentMenuOnViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeMenuWithKeyboard)
      window.removeEventListener('resize', closeStudentMenuOnViewportChange)
      window.removeEventListener('scroll', closeStudentMenuOnViewportChange, true)
    }
  }, [openClassMenu, openStudentMenu])

  function saveStudent(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const providedRegistration = String(form.get('registration')).trim()
    const registration = providedRegistration || nextStudentRegistration(data.students)
    if (data.students.some((student) => student.id !== editingStudent?.id && normalize(student.registration) === normalize(registration))) {
      notify('Matrícula já cadastrada', 'Use outra matrícula ou atualize o aluno existente.', 'warning')
      return
    }

    if (editingStudent) {
      const name = String(form.get('name')).trim()
      const classId = String(form.get('classId'))
      const classChanged = classId !== editingStudent.classId
      setData((current) => ({
        ...current,
        students: current.students.map((student) => student.id === editingStudent.id ? {
          ...student,
          name,
          registration,
          registrationType: providedRegistration
            ? providedRegistration === editingStudent.registration ? editingStudent.registrationType : 'external'
            : 'internal',
          classId,
          status: String(form.get('status') || editingStudent.status || 'Ativo'),
          updatedAt: new Date().toISOString(),
        } : student),
        assessments: classChanged ? current.assessments.map((assessment) => ({
          ...assessment,
          answerKeyVersionIdByStudent: Object.fromEntries(
            Object.entries(assessment.answerKeyVersionIdByStudent || {}).filter(([studentId]) => studentId !== editingStudent.id),
          ),
        })) : current.assessments,
      }))
      closeStudentModal()
      notify('Aluno atualizado', `${name} foi atualizado com sucesso.`)
      return
    }

    const student = {
      id: uid('student'), name: String(form.get('name')).trim(), registration,
      registrationType: providedRegistration ? 'external' : 'internal',
      classId: String(form.get('classId')), status: 'Ativo', source: 'Manual', updatedAt: new Date().toISOString(),
    }
    setData((current) => ({ ...current, students: [...current.students, student] }))
    closeStudentModal()
    notify('Aluno adicionado', `${student.name} já aparece na turma.`)
  }

  function openNewStudentModal() {
    setEditingStudent(null)
    setStudentModal(true)
  }

  function openEditStudentModal(student) {
    setOpenStudentMenu(null)
    setEditingStudent(student)
    setStudentModal(true)
  }

  function toggleStudentMenu(event, studentId) {
    if (openStudentMenu?.id === studentId) {
      setOpenStudentMenu(null)
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const menuWidth = 158
    const menuHeight = 82
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, bounds.right - menuWidth))
    const top = window.innerHeight - bounds.bottom >= menuHeight + 8
      ? bounds.bottom + 5
      : Math.max(8, bounds.top - menuHeight - 5)
    setOpenStudentMenu({ id: studentId, left, top })
  }

  function closeStudentModal() {
    setStudentModal(false)
    setEditingStudent(null)
  }

  function confirmDeleteStudent(student) {
    setOpenStudentMenu(null)
    setStudentToDelete(student)
  }

  function deleteStudent() {
    if (!studentToDelete) return
    const student = studentToDelete
    setData((current) => ({
      ...current,
      students: current.students.filter((item) => item.id !== student.id),
      submissions: current.submissions.filter((submission) => submission.studentId !== student.id),
      assessments: current.assessments.map((assessment) => ({
        ...assessment,
        answerKeyVersionIdByStudent: Object.fromEntries(
          Object.entries(assessment.answerKeyVersionIdByStudent || {}).filter(([studentId]) => studentId !== student.id),
        ),
      })),
    }))
    setStudentToDelete(null)
    notify('Aluno removido', `${student.name} e suas correções vinculadas foram removidos.`)
  }

  function openStudentImport(classroom) {
    setOpenClassMenu(null)
    setStudentImportClass(classroom)
    setStudentImportFile(null)
    setStudentImportColumn('')
  }

  function closeStudentImport() {
    setStudentImportClass(null)
    setStudentImportFile(null)
    setStudentImportColumn('')
    setStudentImportLoading(false)
    if (studentImportInputRef.current) studentImportInputRef.current.value = ''
  }

  async function selectStudentImportFile(file) {
    if (!file) return
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      notify('Formato não reconhecido', 'Selecione uma planilha CSV ou XLSX.', 'warning')
      return
    }

    setStudentImportLoading(true)
    try {
      const parsed = await readSegesFile(file)
      if (!parsed.rows.length) throw new Error('A planilha não contém registros.')
      setStudentImportFile({ ...parsed, name: file.name, size: file.size, rowOffset: 2, source: 'file' })
      setStudentImportColumn(suggestStudentNameColumn(parsed.headers))
    } catch (error) {
      notify('Não foi possível ler a planilha', error.message || 'Verifique o arquivo selecionado.', 'warning')
    } finally {
      setStudentImportLoading(false)
    }
  }

  function pasteStudentList(event) {
    const clipboardText = event.clipboardData?.getData('text/plain') || ''
    if (!clipboardText.trim()) return
    event.preventDefault()

    const parsed = readPastedTable(clipboardText)
    if (!parsed.rows.length) {
      notify('Lista vazia', 'Copie pelo menos um nome antes de usar Ctrl+V.', 'warning')
      return
    }
    setStudentImportFile({ ...parsed, name: 'Lista colada', size: clipboardText.length, source: 'clipboard' })
    setStudentImportColumn(suggestStudentNameColumn(parsed.headers))
  }

  function importStudentsIntoClass() {
    if (!studentImportClass || !studentImportColumn || !readyStudentImportRows.length) return

    const importedNames = readyStudentImportRows.map((row) => row.name)
    setData((current) => {
      const studentsWithImports = [...current.students]
      importedNames.forEach((name) => {
        studentsWithImports.push({
          id: uid('student'),
          name,
          registration: nextStudentRegistration(studentsWithImports),
          registrationType: 'internal',
          classId: studentImportClass.id,
          status: 'Ativo',
          source: studentImportFile.source === 'clipboard' ? 'Colagem' : 'Planilha',
          updatedAt: new Date().toISOString(),
        })
      })
      return { ...current, students: studentsWithImports }
    })

    const ignored = studentImportRows.length - readyStudentImportRows.length
    const className = studentImportClass.name
    closeStudentImport()
    notify(
      `${importedNames.length} aluno${importedNames.length !== 1 ? 's' : ''} adicionado${importedNames.length !== 1 ? 's' : ''}`,
      ignored
        ? `${ignored} linha${ignored !== 1 ? 's' : ''} vazia${ignored !== 1 ? 's' : ''} ou duplicada${ignored !== 1 ? 's' : ''} ignorada${ignored !== 1 ? 's' : ''}.`
        : `A turma ${className} foi atualizada.`,
    )
  }

  function saveClass(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values = {
      name: String(form.get('name')).trim(),
      grade: String(form.get('grade')).trim(),
      shift: String(form.get('shift')),
      year: Number(form.get('year')),
    }

    const duplicate = data.classes.some((classroom) => (
      classroom.id !== editingClass?.id
      && normalize(`${classroom.name}|${classroom.grade}|${classroom.shift}|${classroom.year}`)
        === normalize(`${values.name}|${values.grade}|${values.shift}|${values.year}`)
    ))
    if (duplicate) {
      notify('Turma já cadastrada', 'Já existe uma turma com o mesmo nome, série, turno e ano.', 'warning')
      return
    }

    if (editingClass) {
      setData((current) => ({
        ...current,
        classes: current.classes.map((classroom) => (
          classroom.id === editingClass.id ? { ...classroom, ...values } : classroom
        )),
      }))
      notify('Turma atualizada', `${values.name} foi atualizada com sucesso.`)
    } else {
      const classroom = {
        id: uid('class'),
        ...values,
        color: classColors[data.classes.length % classColors.length],
      }
      setData((current) => ({ ...current, classes: [...current.classes, classroom] }))
      notify('Turma criada', `${classroom.name} está pronta para receber alunos.`)
    }

    setClassModal(false)
    setEditingClass(null)
  }

  function openNewClassModal() {
    setEditingClass(null)
    setClassModal(true)
  }

  function openEditClassModal(classroom) {
    setOpenClassMenu(null)
    setEditingClass(classroom)
    setClassModal(true)
  }

  function closeClassModal() {
    setClassModal(false)
    setEditingClass(null)
  }

  function confirmDeleteClass(classroom) {
    setOpenClassMenu(null)
    setClassToDelete(classroom)
  }

  function deleteClass() {
    if (!classToDelete) return

    const classroom = classToDelete
    setData((current) => {
      const classStudents = current.students.filter((student) => student.classId === classroom.id)
      const studentIds = new Set(classStudents.map((student) => student.id))
      const assessments = current.assessments.map((assessment) => {
        const answerKeysByClass = Object.fromEntries(
          Object.entries(assessment.answerKeysByClass || {}).filter(([classId]) => classId !== classroom.id),
        )
        const answerKeyVersionIdsByClass = Object.fromEntries(
          Object.entries(assessment.answerKeyVersionIdsByClass || {}).filter(([classId]) => classId !== classroom.id),
        )
        const answerKeyVersionIdByStudent = Object.fromEntries(
          Object.entries(assessment.answerKeyVersionIdByStudent || {}).filter(([studentId]) => !studentIds.has(studentId)),
        )
        return {
          ...assessment,
          classIds: assessment.classIds.filter((classId) => classId !== classroom.id),
          answerKeysByClass,
          answerKeyVersionIdsByClass,
          answerKeyVersionIdByStudent,
        }
      })

      return {
        ...current,
        classes: current.classes.filter((item) => item.id !== classroom.id),
        students: current.students.filter((student) => student.classId !== classroom.id),
        submissions: current.submissions.filter((submission) => (
          submission.classId !== classroom.id && !studentIds.has(submission.studentId)
        )),
        assessments,
      }
    })

    if (selectedClass === classroom.id) setSelectedClass('all')
    setClassToDelete(null)
    notify('Turma excluída', `${classroom.name} e os dados vinculados foram removidos.`)
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
          <Button icon={tab === 'students' ? UserPlus : Plus} onClick={() => tab === 'students' ? openNewStudentModal() : openNewClassModal()}>{tab === 'students' ? 'Adicionar aluno' : 'Nova turma'}</Button>
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
              <thead><tr><th>ALUNO</th><th>MATRÍCULA / CONTROLE</th><th>TURMA</th><th>TURNO</th><th>ORIGEM</th><th>SITUAÇÃO</th><th /></tr></thead>
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
                      <td className="student-row-actions">
                        <div className="student-row-menu">
                          <button
                            className="icon-button"
                            aria-label={`Opções do aluno ${student.name}`}
                            aria-haspopup="menu"
                            aria-expanded={openStudentMenu?.id === student.id}
                            onClick={(event) => toggleStudentMenu(event, student.id)}
                          ><MoreHorizontal size={18} /></button>
                        </div>
                      </td>
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
                <div className="class-card-top" style={{ '--class-color': classroom.color }}>
                  <span><UsersRound size={21} /></span>
                  <div className="class-card-menu">
                    <button
                      className="icon-button"
                      aria-label={`Opções da turma ${classroom.name}`}
                      aria-haspopup="menu"
                      aria-expanded={openClassMenu === classroom.id}
                      onClick={() => setOpenClassMenu((current) => current === classroom.id ? null : classroom.id)}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {openClassMenu === classroom.id && (
                      <div className="class-card-menu-popover" role="menu">
                        <button role="menuitem" onClick={() => openStudentImport(classroom)}><UserPlus size={15} /> Adicionar alunos</button>
                        <button role="menuitem" onClick={() => openEditClassModal(classroom)}><Pencil size={15} /> Editar turma</button>
                        <button className="danger" role="menuitem" onClick={() => confirmDeleteClass(classroom)}><Trash2 size={15} /> Excluir turma</button>
                      </div>
                    )}
                  </div>
                </div>
                <h3>{classroom.name}</h3><p>{classroom.grade} · {classroom.shift}</p>
                <div className="class-stats"><span><strong>{members.length}</strong> alunos ativos</span><span><strong>{assessments.length}</strong> simulados</span></div>
                <div className="avatar-stack">{members.slice(0, 5).map((student) => <i key={student.id}>{initials(student.name)}</i>)}{members.length > 5 && <em>+{members.length - 5}</em>}</div>
                <button className="class-open" onClick={() => { setTab('students'); setSelectedClass(classroom.id) }}>Ver alunos <ChevronRight size={16} /></button>
              </article>
            )
          })}
          <button className="new-class-card" onClick={openNewClassModal}><span><Plus size={23} /></span><strong>Criar nova turma</strong><small>Adicione alunos manualmente ou pelo SEGES</small></button>
        </div>
      )}

      {openStudentMenu && (() => {
        const student = data.students.find((item) => item.id === openStudentMenu.id)
        if (!student) return null
        return createPortal(
          <div className="student-row-menu-popover" role="menu" style={{ left: openStudentMenu.left, top: openStudentMenu.top }}>
            <button role="menuitem" onClick={() => openEditStudentModal(student)}><Pencil size={15} /> Editar aluno</button>
            <button className="danger" role="menuitem" onClick={() => confirmDeleteStudent(student)}><Trash2 size={15} /> Remover aluno</button>
          </div>,
          document.body,
        )
      })()}

      <Modal open={studentModal} onClose={closeStudentModal} title={editingStudent ? 'Editar aluno' : 'Adicionar aluno'} subtitle={editingStudent ? 'Atualize o nome, a turma ou a situação do aluno.' : 'A matrícula é opcional e pode ser gerada automaticamente pelo app.'} footer={<><Button variant="ghost" onClick={closeStudentModal}>Cancelar</Button><Button type="submit" form="student-form">{editingStudent ? 'Salvar alterações' : 'Adicionar aluno'}</Button></>}>
        <form key={editingStudent?.id || 'new-student'} id="student-form" onSubmit={saveStudent} className="form-grid">
          <Field label="Nome completo" required><input name="name" required defaultValue={editingStudent?.name || ''} placeholder="Ex.: Ana Clara dos Santos" /></Field>
          <Field label="Matrícula" hint="Opcional. Se ficar vazia, um número de controle será criado."><input name="registration" inputMode="numeric" defaultValue={editingStudent?.registration || ''} placeholder="Deixe em branco para gerar automaticamente" /></Field>
          <Field label="Turma" required><select name="classId" required defaultValue={editingStudent?.classId || ''}><option value="" disabled>Selecione</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.shift}</option>)}</select></Field>
          {editingStudent && <Field label="Situação" required><select name="status" defaultValue={editingStudent.status || 'Ativo'}><option>Ativo</option><option>Inativo</option></select></Field>}
        </form>
      </Modal>

      <Modal
        open={Boolean(studentToDelete)}
        onClose={() => setStudentToDelete(null)}
        title="Remover aluno"
        subtitle="Confira o impacto antes de continuar."
        footer={<><Button variant="ghost" onClick={() => setStudentToDelete(null)}>Cancelar</Button><Button variant="danger" icon={Trash2} onClick={deleteStudent}>Remover definitivamente</Button></>}
      >
        {studentToDelete && (() => {
          const classroom = data.classes.find((item) => item.id === studentToDelete.classId)
          const submissions = data.submissions.filter((submission) => submission.studentId === studentToDelete.id)
          return (
            <div className="delete-student-confirmation">
              <span><AlertTriangle size={22} /></span>
              <div>
                <p>Tem certeza de que deseja remover <strong>{studentToDelete.name}</strong> da turma <strong>{classroom?.name || 'sem turma'}</strong>?</p>
                <ul>
                  <li>O cadastro e o número de controle serão removidos</li>
                  <li>{submissions.length} correç{submissions.length !== 1 ? 'ões' : 'ão'} vinculada{submissions.length !== 1 ? 's' : ''} será{submissions.length !== 1 ? 'ão' : ''} excluída{submissions.length !== 1 ? 's' : ''}</li>
                  <li>As atribuições individuais de versão serão apagadas</li>
                </ul>
                <small>Esta ação não pode ser desfeita.</small>
              </div>
            </div>
          )
        })()}
      </Modal>

      <Modal
        open={Boolean(studentImportClass)}
        onClose={closeStudentImport}
        title={`Adicionar alunos${studentImportClass ? ` · ${studentImportClass.name}` : ''}`}
        subtitle="Importe uma tabela e indique qual coluna contém os nomes dos alunos."
        size="lg"
        footer={<><Button variant="ghost" onClick={closeStudentImport}>Cancelar</Button><Button icon={UserPlus} disabled={!studentImportColumn || !readyStudentImportRows.length} onClick={importStudentsIntoClass}>Adicionar {readyStudentImportRows.length || ''} aluno{readyStudentImportRows.length !== 1 ? 's' : ''}</Button></>}
      >
        {!studentImportFile ? (
          studentImportLoading ? (
            <div className="class-student-import-upload"><RefreshCw className="spin" size={30} /><h3>Lendo a tabela...</h3><p>Aguarde enquanto identificamos as colunas.</p></div>
          ) : (
            <div className="class-student-import-start">
              <label className="class-student-paste">
                <span><ClipboardPaste size={28} /></span>
                <h3>Cole uma lista</h3>
                <p>Copie nomes ou células do Excel e pressione Ctrl+V (ou ⌘V no Mac).</p>
                <textarea autoFocus aria-label="Cole aqui a lista de alunos" onPaste={pasteStudentList} placeholder={'Ana Clara dos Santos\nBruno Ferreira Lima\nCarla Souza'} />
                <small>A lista pode ter uma ou várias colunas.</small>
              </label>
              <div className="class-student-import-or"><span>OU</span></div>
              <div className="class-student-import-upload">
                <span><UploadCloud size={28} /></span>
                <h3>Envie uma tabela</h3>
                <p>A primeira linha deve conter os títulos das colunas.</p>
                <Button variant="secondary" icon={FileSpreadsheet} onClick={() => studentImportInputRef.current?.click()}>Escolher arquivo</Button>
                <small>Formatos aceitos: CSV ou XLSX</small>
                <input ref={studentImportInputRef} hidden type="file" accept=".csv,.xlsx" onChange={(event) => selectStudentImportFile(event.target.files[0])} />
              </div>
            </div>
          )
        ) : (
          <div className="class-student-import-mapping">
            <header className="selected-file">
              <span><FileCheck2 size={23} /></span>
              <div><strong>{studentImportFile.name}</strong><small>{studentImportFile.rows.length} linhas · aba “{studentImportFile.sheetName}”</small></div>
              <button className="icon-button" aria-label="Trocar arquivo" onClick={() => { setStudentImportFile(null); setStudentImportColumn(''); if (studentImportInputRef.current) studentImportInputRef.current.value = '' }}><X size={18} /></button>
            </header>
            <label className="class-student-column-picker">
              <span>Qual coluna contém o nome dos alunos?</span>
              <select value={studentImportColumn} onChange={(event) => setStudentImportColumn(event.target.value)}>
                <option value="">Selecione uma coluna</option>
                {studentImportFile.headers.map((header) => <option key={header} value={header}>{header}</option>)}
              </select>
              <small>Somente essa coluna será importada. As matrículas de controle serão geradas automaticamente.</small>
            </label>
            {studentImportColumn && (
              <div className="class-student-import-preview">
                <div className="class-student-import-summary">
                  <span><strong>{readyStudentImportRows.length}</strong> prontos para adicionar</span>
                  <span><strong>{studentImportRows.length - readyStudentImportRows.length}</strong> vazios ou duplicados</span>
                </div>
                <div className="table-wrap"><table><thead><tr><th>LINHA</th><th>NOME DO ALUNO</th><th>STATUS</th></tr></thead><tbody>{studentImportRows.slice(0, 8).map((row) => <tr key={row.index}><td>{row.index + (studentImportFile.rowOffset || 2)}</td><td><strong>{row.name || '—'}</strong></td><td><Badge tone={row.status === 'ready' ? 'green' : 'neutral'}>{row.status === 'ready' ? 'Será adicionado' : row.status === 'duplicate' ? 'Já está na turma' : 'Linha vazia'}</Badge></td></tr>)}</tbody></table></div>
                {studentImportRows.length > 8 && <small className="class-student-preview-more">Prévia das 8 primeiras linhas · {studentImportRows.length} linhas analisadas</small>}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={classModal}
        onClose={closeClassModal}
        title={editingClass ? 'Editar turma' : 'Criar turma'}
        subtitle={editingClass ? 'Atualize os dados de identificação da turma.' : 'A turma poderá receber simulados próprios ou compartilhados.'}
        footer={<><Button variant="ghost" onClick={closeClassModal}>Cancelar</Button><Button type="submit" form="class-form">{editingClass ? 'Salvar alterações' : 'Criar turma'}</Button></>}
      >
        <form key={editingClass?.id || 'new-class'} id="class-form" onSubmit={saveClass} className="form-grid two-columns">
          <Field label="Nome da turma" required><input name="name" required defaultValue={editingClass?.name || ''} placeholder="Ex.: 8º A" /></Field>
          <Field label="Ano letivo" required><input type="number" name="year" required defaultValue={editingClass?.year || new Date().getFullYear()} /></Field>
          <Field label="Série / etapa" required><input name="grade" required defaultValue={editingClass?.grade || ''} placeholder="Ex.: 8º ano" /></Field>
          <Field label="Turno" required><select name="shift" defaultValue={editingClass?.shift || 'Matutino'}><option>Matutino</option><option>Vespertino</option><option>Noturno</option><option>Integral</option></select></Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(classToDelete)}
        onClose={() => setClassToDelete(null)}
        title="Excluir turma"
        subtitle="Confira o impacto antes de continuar."
        footer={<><Button variant="ghost" onClick={() => setClassToDelete(null)}>Cancelar</Button><Button variant="danger" icon={Trash2} onClick={deleteClass}>Excluir definitivamente</Button></>}
      >
        {classToDelete && (() => {
          const classStudents = data.students.filter((student) => student.classId === classToDelete.id)
          const studentIds = new Set(classStudents.map((student) => student.id))
          const assessments = data.assessments.filter((assessment) => assessment.classIds.includes(classToDelete.id))
          const submissions = data.submissions.filter((submission) => (
            submission.classId === classToDelete.id || studentIds.has(submission.studentId)
          ))
          return (
            <div className="delete-class-confirmation">
              <span><AlertTriangle size={22} /></span>
              <div>
                <p>Tem certeza de que deseja excluir a turma <strong>{classToDelete.name}</strong>?</p>
                <ul>
                  <li>{classStudents.length} aluno{classStudents.length !== 1 ? 's' : ''} será{classStudents.length !== 1 ? 'ão' : ''} excluído{classStudents.length !== 1 ? 's' : ''}</li>
                  <li>{submissions.length} correç{submissions.length !== 1 ? 'ões' : 'ão'} será{submissions.length !== 1 ? 'ão' : ''} excluída{submissions.length !== 1 ? 's' : ''}</li>
                  <li>A turma será desvinculada de {assessments.length} simulado{assessments.length !== 1 ? 's' : ''}</li>
                </ul>
                <small>Esta ação não pode ser desfeita.</small>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
