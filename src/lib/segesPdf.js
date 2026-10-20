// Parser for the SEGES “Relatório de Alunos por Turma” text table.
// Coordinates keep wrapped names separate from INEP, dates and documents.
export const pdfStudentHeaders = ['Matrícula', 'Nome do aluno', 'Turma', 'Série', 'Status', 'Situação no PDF']

const clean = (value) => String(value).replace(/\s+/g, ' ').trim()

export function createSegesPdfParser() {
  let className = ''
  let columns = null
  const rows = []
  let textFound = false

  return {
    addPage(content, pageNumber) {
      const items = content.items.filter((item) => item.str?.trim()).map((item) => ({
        text: clean(item.str), x: item.transform[4], y: item.transform[5], width: item.width || 0,
      })).sort((a, b) => b.y - a.y || a.x - b.x)
      textFound ||= items.length > 0
      const lines = []
      for (const item of items) {
        let line = lines.find((entry) => Math.abs(entry.y - item.y) < 2)
        if (!line) { line = { y: item.y, items: [] }; lines.push(line) }
        line.items.push(item)
      }
      lines.forEach((line) => line.items.sort((a, b) => a.x - b.x))

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        const text = line.items.map((item) => item.text).join(' ')
        const classMatch = text.match(/Turma:\s*(\S+)/i)
        if (classMatch) { className = classMatch[1]; columns = null; continue }
        const idHeader = line.items.find((item) => item.text === 'ID')
        const inepHeader = line.items.find((item) => item.text === 'INEP')
        const statusHeader = line.items.find((item) => /^Situa/.test(item.text))
        if (idHeader && inepHeader && statusHeader) {
          columns = { idRight: (idHeader.x + inepHeader.x) / 2, nameLeft: inepHeader.x + inepHeader.width + 2, statusLeft: statusHeader.x - 5 }
          continue
        }
        if (!columns) continue
        const id = line.items.find((item) => item.x < columns.idRight && /^\d+$/.test(item.text))
        if (!id) continue
        const birth = line.items.find((item) => /^\d{2}\/\d{2}\/\d{1,4}$/.test(item.text))
        if (!birth || !className) throw new Error(`Registro incompleto na página ${pageNumber}. Confira o relatório de alunos por turma.`)
        const recordLines = [line]
        for (let next = index + 1; next < lines.length; next += 1) {
          const candidate = lines[next]
          if (candidate.items.some((item) => /Turma:/.test(item.text) || (item.x < columns.idRight && /^\d+$/.test(item.text)))) break
          recordLines.push(candidate)
        }
        const selectText = (predicate) => clean(recordLines.flatMap((entry) => entry.items.filter(predicate).map((item) => item.text)).join(' '))
        const name = selectText((item) => item.x >= columns.nameLeft && item.x < birth.x - 1)
        const sourceStatus = selectText((item) => item.x >= columns.statusLeft).replace(/\s+/g, '')
        if (!name || !sourceStatus) throw new Error(`Nome ou situação ausente na página ${pageNumber} (ID ${id.text}).`)
        rows.push({
          'Matrícula': id.text,
          'Nome do aluno': name,
          Turma: className,
          'Série': `${className.match(/\d/)?.[0] || ''}ª série`,
          Status: /^novato$/i.test(sourceStatus) ? 'Matriculado' : sourceStatus,
          'Situação no PDF': sourceStatus,
        })
      }
    },
    finish() {
      if (!rows.length) throw new Error(textFound
        ? 'Não foi encontrada a tabela do relatório de alunos por turma do SEGES neste PDF.'
        : 'Este PDF não contém texto selecionável. Envie o relatório original do SEGES ou uma planilha CSV/XLSX.')
      const unique = new Map()
      for (const row of rows) unique.set(JSON.stringify(row), row)
      return { rows: [...unique.values()], headers: pdfStudentHeaders, sheetName: 'Relatório PDF' }
    },
  }
}

export async function readSegesPdf(file, getDocument) {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const document = await task.promise
    const parser = createSegesPdfParser()
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number)
      try { parser.addPage(await page.getTextContent(), number) }
      finally { page.cleanup() }
    }
    return parser.finish()
  } finally {
    await task.destroy()
  }
}
