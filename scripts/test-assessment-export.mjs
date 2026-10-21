import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { unzipSync } from 'fflate'
import { createCanvas } from '@napi-rs/canvas'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { analyzeSheetImage } from '../src/lib/omr.js'

const chromeCandidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)
let chrome
for (const candidate of chromeCandidates) { try { await access(candidate); chrome = candidate; break } catch {} }
if (!chrome) throw new Error('Defina CHROME_PATH para executar o teste de exportação no navegador.')
const directory = await mkdtemp(join(tmpdir(), 'assessment-export-'))
const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false }, optimizeDeps: { include: ['fflate', 'html2canvas', 'jspdf'] } })
await server.listen()
const url = `http://127.0.0.1:${server.httpServer.address().port}/corretor-simulado/`
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${directory}`, url], { windowsHide: true, stdio: 'ignore' })
let socket
let nextId = 0
const pending = new Map()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const openPdf = (bytes) => getDocument({ data: bytes.slice(), standardFontDataUrl: fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)).replaceAll('\\', '/') })
try {
  let port
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = (await readFile(join(directory, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await sleep(100) }
  }
  if (!port) throw new Error('Chrome não iniciou o depurador.')
  let target
  for (let attempt = 0; attempt < 100; attempt++) {
    target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((item) => item.type === 'page' && item.url.startsWith(url))
    if (target) break
    await sleep(100)
  }
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = (event) => reject(event.error || new Error(event.message || 'Falha ao conectar ao Chrome')) })
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  }
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = await send('Runtime.evaluate', { expression: `location.href.startsWith(${JSON.stringify(url)}) && document.readyState === 'complete'`, returnByValue: true })
    if (state.result.value) { ready = true; break }
    await sleep(100)
  }
  if (!ready) throw new Error('A página de teste não terminou de carregar.')
  const result = await send('Runtime.evaluate', {
    awaitPromise: true, returnByValue: true, timeout: 120000,
    expression: `(async () => {
      try {
        await import('/corretor-simulado/src/styles.css');
        const { exportAssessmentClassPdfs, exportAssessmentClassesZip, buildClassExportGroups, createClassArchive } = await import('/corretor-simulado/src/lib/assessmentExport.js');
        const { resizeQuestions } = await import('/corretor-simulado/src/lib/fullAssessment.js');
        const classes = [{ id: 'a', name: '1ª / A' }, { id: 'b', name: '1ª / A' }, { id: 'c', name: '3ª C' }, { id: 'empty', name: 'Vazia' }];
        const students = ['a', 'b', 'c'].map((classId, i) => ({ id: 'student-' + classId, classId, name: 'Aluno ' + i, status: 'Ativo' }));
        students.unshift({ id: 'last', classId: 'a', name: 'Zilda', status: 'Ativo' });
        students.push({ id: 'inactive', classId: 'a', name: 'Inativo', status: 'Inativo' });
        const assessment = { id: 'export-test', code: 'SIM/ZIP', title: 'Simulado por turma', subjects: ['Matemática'], classIds: classes.map(c => c.id), questionCount: 10, optionCount: 4, answerKey: Array(10).fill('A'), answerKeyVersions: [10, 45, 90].map((questionCount, i) => ({ id: 'v' + i, label: 'Versão ' + i, questionCount, answerKey: Array(questionCount).fill('A') })), answerKeyVersionIdsByClass: { a: ['v0'], b: ['v1'], c: ['v2'] } };
        const school = { name: 'Escola de Teste', city: 'Vitória', state: 'ES' };
        const progress = [];
        const groups = buildClassExportGroups({ assessment, classes, students });
        if (groups.length !== 3 || groups[0].students[0].id !== 'student-a') throw new Error('Agrupamento incorreto');
        try { createClassArchive([], 'EMPTY'); throw new Error('Deveria rejeitar ZIP vazio'); } catch (error) { if (!error.message.includes('Nenhuma turma')) throw error; }
        const start = performance.now();
        const zip = await exportAssessmentClassesZip({ assessment, classes, students, school, onProgress: value => progress.push(value.completed) });
        const sheetMs = performance.now() - start;
        const sheetBytes = Array.from(new Uint8Array(await zip.blob.arrayBuffer()));
        const full = { ...assessment, id: 'full-export', contentMode: 'full', classIds: ['a', 'b'], questionCount: 12, answerKeyVersions: [12, 3].map((questionCount, i) => ({ id: 'v' + i, label: 'Versão ' + i, questionCount, answerKey: Array(questionCount).fill('A'), questions: resizeQuestions([], questionCount, 4).map((q, n) => ({ ...q, statement: i === 1 && n === 0 ? 'Leia o trecho e responda. '.repeat(250) : 'Questão ' + (n + 1) + ': Resolva $x^2 + 1$ e justifique sua escolha. '.repeat(5), alternatives: ['Primeira alternativa', 'Segunda alternativa', 'Terceira alternativa', 'Quarta alternativa'], correctIndex: 0 })) })) };
        const directFiles = [];
        const events = [];
        await exportAssessmentClassPdfs({ assessment, classes, students, school, onProgress: p => events.push('class:' + p.classIndex), onFile: f => { directFiles.push({ filename: f.filename, bytes: Array.from(f.bytes) }); events.push('file:' + f.classId); } });
        if (events.indexOf('file:a') >= events.indexOf('class:2')) throw new Error('O primeiro PDF deve ser entregue antes de processar a segunda turma');
        const singleFiles = [];
        await exportAssessmentClassPdfs({ assessment, classes, students, school, classIds: ['b'], onFile: f => singleFiles.push(f.classId) });
        if (singleFiles.join() !== 'b') throw new Error('Download individual incluiu outras turmas');
        const abort = new AbortController();
        let cancelledFiles = 0;
        try {
          await exportAssessmentClassPdfs({ assessment, classes, students, school, signal: abort.signal, onFile: () => { cancelledFiles++; abort.abort(); } });
          throw new Error('Cancelamento ignorado');
        } catch(error) { if (error.name !== 'AbortError') throw error; }
        if (cancelledFiles !== 1 || document.querySelector('.assessment-export-root')) throw new Error('Cancelamento não liberou os recursos');
        const nativeToDataURL = HTMLCanvasElement.prototype.toDataURL;
        let paperCaptures = 0;
        HTMLCanvasElement.prototype.toDataURL = function(type, ...args) { if (type === 'image/jpeg') paperCaptures++; return nativeToDataURL.call(this, type, ...args); };
        const fullZip = await exportAssessmentClassesZip({ assessment: full, classes, students, school, includePaper: true });
        HTMLCanvasElement.prototype.toDataURL = nativeToDataURL;
        if (paperCaptures !== 6) throw new Error('A prova deve ser renderizada uma vez por versão, sem repetir para cada aluno: ' + paperCaptures);
        if (document.querySelector('.assessment-export-root')) throw new Error('Exportação deixou elementos na página');
        const react = await import('/corretor-simulado/node_modules/.vite/deps/react.js');
        const client = await import('/corretor-simulado/node_modules/.vite/deps/react-dom_client.js');
        const dom = await import('/corretor-simulado/node_modules/.vite/deps/react-dom.js');
        const createElement = react.createElement || react.default.createElement;
        const createRoot = client.createRoot || client.default.createRoot;
        const flushSync = dom.flushSync || dom.default.flushSync;
        const { AssessmentsPage } = await import('/corretor-simulado/src/pages/AssessmentsPage.jsx');
        const originalUrl = location.href;
        history.replaceState({}, '', '?print=' + full.id);
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const previewStudents = Array.from({ length: 300 }, (_, i) => ({ id: 'preview-' + i, classId: i < 2 ? 'a' : 'b', name: 'Aluno ' + i, status: 'Ativo' }));
        const pageData = { assessments: [{ ...full, date: '2026-10-21', createdAt: '2026-10-21', status: 'Pronto para aplicar' }], students: previewStudents, classes, school, submissions: [] };
        flushSync(() => root.render(createElement(AssessmentsPage, { data: pageData, setData() {}, setPage() {}, notify() {} })));
        await new Promise(resolve => setTimeout(resolve, 0));
        if (document.querySelectorAll('.print-preview-document .answer-sheet').length !== 1 || document.querySelector('.all-print-sheets')) throw new Error('A prévia de 300 alunos deve montar apenas a página selecionada');
        const selector = document.querySelector('.print-preview-pagination select');
        flushSync(() => { selector.value = '1'; selector.dispatchEvent(new Event('change', { bubbles: true })); });
        if (document.querySelectorAll('.print-preview-document .assessment-paper').length !== 1 || document.querySelector('.all-print-sheets')) throw new Error('Trocar a prévia montou o lote inteiro');
        flushSync(() => document.querySelectorAll('.print-class-option input')[1].click());
        const nativePrint = window.print;
        let printed = false;
        window.print = () => {
          if (document.querySelectorAll('.all-print-sheets .answer-sheet').length !== 2 || document.querySelectorAll('.all-print-sheets .assessment-paper').length !== 2 || document.querySelector('.student-print-sheets') || document.querySelector('.blank-print-sheet')) throw new Error('Impressão deve montar somente os alunos e o modo selecionados');
          printed = true;
          window.dispatchEvent(new Event('afterprint'));
        };
        [...document.querySelectorAll('.modal-footer button')].find(b => b.textContent.includes('Imprimir / salvar PDF')).click();
        for (let attempt = 0; attempt < 100 && !printed; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
        await new Promise(resolve => setTimeout(resolve, 0));
        if (!printed || document.querySelector('.all-print-sheets')) throw new Error('Impressão não liberou o lote depois de fechar');
        window.dispatchEvent(new Event('beforeprint'));
        if (document.querySelectorAll('.all-print-sheets .answer-sheet').length !== 2) throw new Error('Atalho de impressão não preparou o lote');
        window.dispatchEvent(new Event('afterprint'));
        window.print = nativePrint;
        flushSync(() => root.unmount());
        container.remove();
        history.replaceState({}, '', originalUrl);
        return { sheetBytes, fullBytes: Array.from(new Uint8Array(await fullZip.blob.arrayBuffer())), classCount: zip.classCount, studentCount: zip.studentCount, progress, sheetMs, directFiles };
      } catch(error) { return { error: error.stack }; }
    })()`,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  const exported = result.result.value
  if (exported.error) throw new Error(exported.error)
  console.log(`Folhas: ${Math.round(exported.sheetMs)} ms, ${exported.sheetBytes.length} bytes`)
  assert.equal(exported.classCount, 3)
  assert.equal(exported.studentCount, 4)
  assert.equal(exported.progress.at(-1), 4)
  const entries = Object.entries(unzipSync(Uint8Array.from(exported.sheetBytes)))
  assert.equal(entries.length, 3)
  for (const [index, [filename, bytes]] of entries.entries()) {
    assert.ok(filename.endsWith('.pdf'))
    assert.ok(!/[\\/]/.test(filename))
    const task = openPdf(bytes)
    const pdf = await task.promise
    assert.equal(pdf.numPages, index === 0 ? 2 : 1)
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 96 / 72 })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext('2d')
    await page.render({ canvasContext: context, viewport }).promise
    const assessment = { id: 'export-test', questionCount: [10, 45, 90][index], optionCount: 4, answerKey: Array([10, 45, 90][index]).fill('A') }
    const scan = analyzeSheetImage(context.getImageData(0, 0, canvas.width, canvas.height), assessment)
    assert.equal(scan.identity.studentId, 'student-' + ['a', 'b', 'c'][index])
    assert.equal(scan.blank, assessment.questionCount)
    assert.equal(scan.markersFound, 4)
    if (!index) {
      await writeFile(join(directory, 'sheet.pdf'), bytes)
      await writeFile(join(directory, 'sheet.png'), canvas.toBuffer('image/png'))
    }
    await task.destroy()
  }
  const fullEntries = Object.entries(unzipSync(Uint8Array.from(exported.fullBytes)))
  assert.equal(fullEntries.length, 2)
  for (const [index, [, bytes]] of fullEntries.entries()) {
    const task = openPdf(bytes)
    const pdf = await task.promise
    assert.ok(pdf.numPages >= 3, 'Prova completa deve paginar e seguir a folha de respostas')
    if (!index) {
      assert.equal(pdf.numPages, 8, 'Duas provas personalizadas reutilizam a mesma versão')
      const first = await (await pdf.getPage(2)).getTextContent()
      const second = await (await pdf.getPage(6)).getTextContent()
      assert.ok(first.items.some((item) => item.str.includes('Aluno 0')))
      assert.ok(second.items.some((item) => item.str.includes('Zilda')))
      assert.ok(!second.items.some((item) => item.str.includes('Aluno 0')), 'Cache da prova não pode reaproveitar o nome do primeiro aluno')
    }
    if (!index) {
      await writeFile(join(directory, 'full.pdf'), bytes)
    }
    if (index === 1) await writeFile(join(directory, 'long.pdf'), bytes)
    await task.destroy()
  }
  assert.equal(exported.directFiles.length, 3)
  console.log('Exportação validada: PDFs separados entregues turma a turma, cancelamento, versões, QR/OMR, cache com nomes individuais e prévia de 300 alunos sem montar o lote.')
  console.log('Prévia para inspeção: ' + directory)
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  socket?.close()
  browser.kill()
  server.httpServer.closeAllConnections()
  await Promise.race([server.close(), sleep(3000)])
}
