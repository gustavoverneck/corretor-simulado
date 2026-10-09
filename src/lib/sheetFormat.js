// Published geometry: changes require a new ID; never reinterpret printed QRs.
export const SHEET_FORMAT_ID = 'balanced-v4'
export const PREVIOUS_SHEET_FORMAT_ID = 'fixed-90-v3'
export const FIXED_SHEET_LAYOUT = Object.freeze({
  id: PREVIOUS_SHEET_FORMAT_ID, label: '1–90 em página única', columns: 3, rowsPerColumn: 30,
  panelWidth: 205, columnStep: 219, numberX: 91, optionX: 137, optionStep: 29,
  bubbleY: 420, rowStep: 19.5, bubbleRadius: 7, optionFontSize: 6,
})

export function validateSheetFormat(sheetFormat) {
  return Boolean(sheetFormat && [SHEET_FORMAT_ID, PREVIOUS_SHEET_FORMAT_ID].includes(sheetFormat.format)
    && Number.isInteger(sheetFormat.questionCount) && sheetFormat.questionCount >= 1 && sheetFormat.questionCount <= 90
    && Number.isInteger(sheetFormat.optionCount) && sheetFormat.optionCount >= 2 && sheetFormat.optionCount <= 5)
}

export function getSheetFormat(questionCount, optionCount) {
  const sheetFormat = { format: SHEET_FORMAT_ID, questionCount, optionCount }
  if (!validateSheetFormat(sheetFormat)) throw new Error('Formato de folha inválido: use 1–90 questões e 2–5 alternativas.')
  return sheetFormat
}

// A QR selects its published geometry, even after the print layout changes.
export function getSheetLayout(sheetFormat) {
  if (!validateSheetFormat(sheetFormat)) throw new Error('Formato de folha inválido.')
  if (sheetFormat.format === PREVIOUS_SHEET_FORMAT_ID) return FIXED_SHEET_LAYOUT
  const columns = sheetFormat.questionCount <= 40 ? 2 : 3
  const rowsPerColumn = Math.ceil(sheetFormat.questionCount / columns)
  const rowStep = rowsPerColumn <= 20 ? 29.4 : 19.5
  return {
    id: SHEET_FORMAT_ID, columns, rowsPerColumn,
    label: `${columns} colunas · até ${rowsPerColumn} questões por coluna`,
    panelWidth: columns === 2 ? 312 : 205, columnStep: columns === 2 ? 331 : 219,
    numberX: columns === 2 ? 95 : 91, optionX: columns === 2 ? 145 : 137,
    optionStep: columns === 2 ? 43 : 29,
    bubbleY: 425, rowStep, bubbleRadius: columns === 2 ? 9 : 7,
    optionFontSize: columns === 2 ? 7.5 : 6.5,
    panelHeight: 64 + (rowsPerColumn - 1) * rowStep,
  }
}

// v2 used the question count to choose one of these exact historical grids.
export function getLegacySheetLayout(questionCount) {
  if (questionCount <= 20) return { id: '1-20', columns: 1, rowsPerColumn: 20, panelWidth: 643, columnStep: 0, numberX: 170, optionX: 300, optionStep: 55, bubbleY: 425, rowStep: 29.4, bubbleRadius: 9, optionFontSize: 7.5 }
  if (questionCount <= 40) return { id: '21-40', columns: 2, rowsPerColumn: 20, panelWidth: 327, columnStep: 382, numberX: 95, optionX: 164, optionStep: 43, bubbleY: 425, rowStep: 29.4, bubbleRadius: 9, optionFontSize: 7.5 }
  if (questionCount <= 60) return { ...FIXED_SHEET_LAYOUT, id: '41-60', rowsPerColumn: 20, bubbleY: 425, rowStep: 29.4, optionFontSize: 6.5 }
  return { ...FIXED_SHEET_LAYOUT, id: '61-90', bubbleRadius: 6.2 }
}
