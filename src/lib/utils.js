export function cn(...values) {
  return values.filter(Boolean).join(' ')
}

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function nextStudentRegistration(students = []) {
  let highest = BigInt(`${new Date().getFullYear()}0000000`)
  students.forEach((student) => {
    const registration = String(student?.registration ?? '').trim()
    if (!/^\d+$/.test(registration)) return
    const value = BigInt(registration)
    if (value > highest) highest = value
  })
  return String(highest + 1n)
}

export function formatDate(value, options = {}) {
  if (!value) return '—'
  const date = String(value).length === 10 ? new Date(`${value}T12:00:00`) : new Date(value)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: options.long ? 'long' : 'short',
    year: options.year === false ? undefined : 'numeric',
  }).format(date)
}

export function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function crc32(text) {
  let crc = 0 ^ -1
  for (let index = 0; index < text.length; index += 1) {
    crc ^= text.charCodeAt(index)
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return ((crc ^ -1) >>> 0).toString(36).toUpperCase()
}

export function qrPayload(studentId, assessmentId, version = 2) {
  const body = `LUMA|${version}|${studentId ?? ''}|${assessmentId}`
  return `${body}|${crc32(body)}`
}

export function parseQrPayload(payload) {
  const parts = String(payload || '').split('|')
  const version = Number(parts[1])
  if (parts.length !== 5 || parts[0] !== 'LUMA' || ![1, 2].includes(version) || !parts[3]) return null
  const body = parts.slice(0, 4).join('|')
  if (crc32(body) !== parts[4]) return null
  return { studentId: parts[2] || null, assessmentId: parts[3], version }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function average(values) {
  if (!values.length) return 0
  return Math.round(values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length)
}
