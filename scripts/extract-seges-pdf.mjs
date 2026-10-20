import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readSegesPdf } from '../src/lib/segesPdf.js'

const [outputDirectory, ...files] = process.argv.slice(2)
if (!outputDirectory || !files.length) throw new Error('Uso: node scripts/extract-seges-pdf.mjs <pasta de saída> <relatório.pdf> [...]')
await mkdir(outputDirectory, { recursive: true })
for (const path of files) {
  const bytes = await readFile(path)
  const parsed = await readSegesPdf({ arrayBuffer: async () => bytes }, getDocument)
  const shift = /matutino/i.test(basename(path)) ? 'Matutino' : /vespertino/i.test(basename(path)) ? 'Vespertino' : ''
  const headers = [...parsed.headers, ...(shift ? ['Turno'] : [])]
  const rows = parsed.rows.map((row) => ({ ...row, ...(shift ? { Turno: shift } : {}) }))
  const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [headers, ...rows.map((row) => headers.map((header) => row[header]))].map((row) => row.map(cell).join(';')).join('\r\n')
  const output = join(outputDirectory, `${basename(path, '.pdf')}.csv`)
  await writeFile(output, `\ufeff${csv}\r\n`, 'utf8')
  console.log(`${output}: ${rows.length} alunos, ${new Set(rows.map((row) => row.Turma)).size} turmas.`)
}
