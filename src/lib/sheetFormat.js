// Published geometry: changes require a new ID; never reinterpret printed QRs.
export const SHEET_FORMAT_ID = 'fixed-90-v3'
export const FIXED_SHEET_LAYOUT = Object.freeze({
  id: SHEET_FORMAT_ID, label: '1–90 em página única', columns: 3, rowsPerColumn: 30,
  panelWidth: 205, columnStep: 219, numberX: 91, optionX: 137, optionStep: 29,
  bubbleY: 420, rowStep: 19.5, bubbleRadius: 7, optionFontSize: 6,
})

export function validateSheetFormat(sheetFormat) {
  return Boolean(sheetFormat && sheetFormat.format === SHEET_FORMAT_ID
    && Number.isInteger(sheetFormat.questionCount) && sheetFormat.questionCount >= 1 && sheetFormat.questionCount <= 90
    && Number.isInteger(sheetFormat.optionCount) && sheetFormat.optionCount >= 2 && sheetFormat.optionCount <= 5)
}

export function getSheetFormat(questionCount, optionCount) {
  const sheetFormat = { format: SHEET_FORMAT_ID, questionCount, optionCount }
  if (!validateSheetFormat(sheetFormat)) throw new Error('Formato de folha inválido: use 1–90 questões e 2–5 alternativas.')
  return sheetFormat
}
