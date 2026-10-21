import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)
let chrome
for (const candidate of candidates) { try { await access(candidate); chrome = candidate; break } catch {} }
if (!chrome) throw new Error('Defina CHROME_PATH para testar a interface.')
const directory = await mkdtemp(join(tmpdir(), 'omr-settings-'))
const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
await server.listen()
const url = `http://127.0.0.1:${server.httpServer.address().port}/corretor-simulado/`
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${directory}`, url], { windowsHide: true, stdio: 'ignore' })
let socket
let nextId = 0
const pending = new Map()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 30000 })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
  return response.result.value
}
try {
  let port
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = (await readFile(join(directory, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await sleep(100) }
  }
  if (!port) throw new Error('Chrome não iniciou.')
  let target
  for (let attempt = 0; attempt < 100; attempt++) {
    target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page' && item.url.startsWith(url))
    if (target) break
    await sleep(100)
  }
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = event => reject(event.error || new Error('Conexão falhou')) })
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(`location.href.startsWith(${JSON.stringify(url)}) && document.readyState === 'complete'`)) break
    await sleep(100)
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false })
  await evaluate(`(async () => {
    await import('/corretor-simulado/src/styles.css');
    const react = await import('/corretor-simulado/node_modules/.vite/deps/react.js');
    const client = await import('/corretor-simulado/node_modules/.vite/deps/react-dom_client.js');
    const dom = await import('/corretor-simulado/node_modules/.vite/deps/react-dom.js');
    const h = react.createElement || react.default.createElement;
    const useState = react.useState || react.default.useState;
    const createRoot = client.createRoot || client.default.createRoot;
    window.testFlush = dom.flushSync || dom.default.flushSync;
    const { OmrSettingsPanel } = await import('/corretor-simulado/src/components/OmrSettingsPanel.jsx');
    document.querySelector('#root').style.display = 'none';
    const mount = document.createElement('div');
    mount.style.cssText = 'max-width:1100px;margin:auto;padding:16px;box-sizing:border-box';
    document.body.append(mount);
    function Test() {
      const [settings, setSettings] = useState({ markThreshold: .38, ambiguityThreshold: .22, colorThreshold: .18 });
      window.testSettings = settings;
      return h(OmrSettingsPanel, { settings, onChange: values => setSettings(previous => ({ ...previous, ...values })) });
    }
    testFlush(() => createRoot(mount).render(h(Test)));
    window.testClick = text => testFlush(() => [...mount.querySelectorAll('button')].find(button => button.textContent.includes(text)).click());
    window.testRange = (id, value) => testFlush(() => {
      const input = document.getElementById(id);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    window.testCounts = () => Object.fromEntries([...mount.querySelectorAll('.omr-preview-counts > span')].map(el => [el.className, Number(el.querySelector('strong').textContent)]));
  })()`)
  assert.equal(await evaluate("document.querySelectorAll('.omr-example-row').length"), 8)
  const initial = await evaluate('testCounts()')
  await evaluate("testClick('Foto com sombra')")
  const recommended = await evaluate('testCounts()')
  assert.ok(recommended.uncertain < initial.uncertain, 'Perfil deve filtrar a sombra demonstrativa')
  assert.equal(recommended.multiple, 1)
  assert.equal(await evaluate('testSettings.colorThreshold'), .18)
  await evaluate("testRange('omr-mark-threshold', '60')")
  assert.equal(await evaluate('testSettings.markThreshold'), .6)
  assert.ok((await evaluate('testCounts()')).uncertain > recommended.uncertain)
  await evaluate("testClick('Restaurar ajuste recomendado'); testRange('omr-ambiguity-threshold', '35')")
  assert.ok((await evaluate('testCounts()')).blank > recommended.blank)
  assert.equal((await evaluate('testCounts()')).multiple, 1)
  await evaluate("testClick('Restaurar ajuste recomendado')")
  await writeFile(join(directory, 'desktop.png'), Buffer.from((await send('Page.captureScreenshot', { captureBeyondViewport: true })).data, 'base64'))
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Celular sem rolagem horizontal')
  await writeFile(join(directory, 'mobile.png'), Buffer.from((await send('Page.captureScreenshot', { captureBeyondViewport: true })).data, 'base64'))
  if (process.argv[2]) {
    const bytes = await readFile(process.argv[2])
    await evaluate(`(() => {
      const bytes = Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}), c => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'folha-teste.jpeg', { type: 'image/jpeg' }));
      const input = document.querySelector('input[type=file][aria-label="Foto para testar a leitura"]');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`)
    let loaded = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate("!!document.querySelector('.omr-photo-preview')")) { loaded = true; break }
      const error = await evaluate("document.querySelector('[role=alert]')?.textContent")
      if (error) throw new Error(error)
      await sleep(100)
    }
    assert.ok(loaded, 'Foto processada')
    assert.equal(await evaluate("document.querySelectorAll('.omr-photo-answers button').length"), 40)
    assert.deepEqual(await evaluate('testCounts()'), { marked: 40, uncertain: 0, multiple: 0, blank: 0 })
    await evaluate("testRange('omr-ambiguity-threshold', '22')")
    assert.deepEqual(await evaluate('testCounts()'), { marked: 37, uncertain: 3, multiple: 0, blank: 0 })
    await evaluate("testClick('Foto com sombra')")
    assert.equal((await evaluate('testCounts()')).marked, 40)
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
    await writeFile(join(directory, 'photo-mobile.png'), Buffer.from((await send('Page.captureScreenshot', { captureBeyondViewport: true })).data, 'base64'))
    console.log('Foto: 37 confirmadas + 3 dúvidas → 40 confirmadas + 0 dúvidas.')
  }
  console.log('Interface validada: perfis, sliders, prévia real, marcas duplas e celular. Capturas:', directory)
} finally {
  socket?.close()
  browser.kill()
  server.httpServer?.closeAllConnections?.()
  await Promise.race([server.close(), sleep(3000)])
}
