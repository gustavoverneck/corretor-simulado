const fs = require('node:fs')
const path = require('node:path')

// Lembra o tamanho, a posição e se a janela estava maximizada. Na primeira
// abertura (sem nada salvo) a janela abre maximizada.

const DEFAULT_SIZE = { width: 1440, height: 900 }
const MIN_SIZE = { width: 980, height: 650 }

function statePath(userDataPath) {
  return path.join(userDataPath, 'janela.json')
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

// Uma posição só vale se a janela ficar ao menos em parte dentro de algum
// monitor (o monitor pode ter sido desconectado desde a última vez).
function visibleOnSomeDisplay(bounds, displays) {
  return displays.some(({ workArea: area }) => {
    const overlapX = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
    const overlapY = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
    return overlapX >= 120 && overlapY >= 80
  })
}

function sanitizeState(raw, displays = []) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SIZE, maximized: true }
  const width = isNumber(raw.width) ? Math.max(MIN_SIZE.width, Math.round(raw.width)) : DEFAULT_SIZE.width
  const height = isNumber(raw.height) ? Math.max(MIN_SIZE.height, Math.round(raw.height)) : DEFAULT_SIZE.height
  const state = { width, height, maximized: raw.maximized !== false }
  if (isNumber(raw.x) && isNumber(raw.y)) {
    const bounds = { x: Math.round(raw.x), y: Math.round(raw.y), width, height }
    if (visibleOnSomeDisplay(bounds, displays)) Object.assign(state, { x: bounds.x, y: bounds.y })
  }
  return state
}

function readState(userDataPath, displays) {
  try {
    return sanitizeState(JSON.parse(fs.readFileSync(statePath(userDataPath), 'utf8')), displays)
  } catch {
    return sanitizeState(null, displays)
  }
}

function writeState(userDataPath, state) {
  try {
    fs.mkdirSync(userDataPath, { recursive: true })
    fs.writeFileSync(statePath(userDataPath), JSON.stringify(state, null, 2), 'utf8')
  } catch {
    // Não lembrar o tamanho da janela não deve impedir o app de fechar.
  }
}

// Acompanha a janela e grava o estado (com atraso, para não gravar a cada
// pixel ao arrastar) e ao fechar. Guarda o tamanho "normal" mesmo quando a
// janela está maximizada, para restaurar direito depois.
function trackWindow(window, userDataPath) {
  let timer = null
  let normalBounds = window.isMaximized() || window.isFullScreen() ? null : window.getBounds()
  const snapshot = () => {
    if (window.isDestroyed()) return null
    const maximized = window.isMaximized() || window.isFullScreen()
    if (!maximized && !window.isMinimized()) normalBounds = window.getBounds()
    const bounds = normalBounds || window.getNormalBounds?.() || window.getBounds()
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized }
  }
  const save = () => {
    clearTimeout(timer)
    const state = snapshot()
    if (state) writeState(userDataPath, state)
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(save, 600) }
  for (const event of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) window.on(event, schedule)
  window.on('close', save)
  return save
}

module.exports = { DEFAULT_SIZE, MIN_SIZE, sanitizeState, readState, writeState, trackWindow, visibleOnSomeDisplay }
