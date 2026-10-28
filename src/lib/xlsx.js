import { strToU8, zipSync } from 'fflate'

// Gerador mínimo de .xlsx (OOXML) com estilos, mesclagens, larguras e fórmulas.
const escape = (value) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

export function columnName(index) {
  let name = ''
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + ((value - 1) % 26)) + name
  return name
}

export function cellRef(row, column) { return `${columnName(column)}${row + 1}` }

export function sheetName(value, used = new Set()) {
  const base = String(value || 'Planilha').replace(/[[\]:*?/\\]/g, '-').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Planilha'
  let name = base
  for (let index = 2; used.has(name.toLowerCase()); index += 1) name = `${base.slice(0, 31 - String(index).length - 1)} ${index}`
  used.add(name.toLowerCase())
  return name
}

function styleRegistry() {
  const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>']
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>']
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']
  const cache = new Map()
  const indexOf = (list, xml) => { const found = list.indexOf(xml); if (found >= 0) return found; list.push(xml); return list.length - 1 }
  function id(style) {
    if (!style) return 0
    const key = JSON.stringify(style)
    if (cache.has(key)) return cache.get(key)
    const fontId = indexOf(fonts, `<font>${style.bold ? '<b/>' : ''}${style.italic ? '<i/>' : ''}<sz val="${style.size || 11}"/>${style.color ? `<color rgb="FF${style.color}"/>` : ''}<name val="Calibri"/></font>`)
    const fillId = style.fill ? indexOf(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${style.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0
    const line = (side) => style.border ? `<${side} style="${side === 'left' && style.border === 'strong' ? 'medium' : 'thin'}"><color rgb="FF${side === 'left' && style.border === 'strong' ? style.borderColor || '7A8C83' : 'D5DED8'}"/></${side}>` : `<${side}/>`
    const borderId = style.border ? indexOf(borders, `<border>${line('left')}${line('right')}${line('top')}${line('bottom')}<diagonal/></border>`) : 0
    const numFmtId = style.numFmt === 'percent' ? 9 : style.numFmt === 'decimal' ? 164 : 0
    const alignment = style.align || style.wrap || style.valign ? `<alignment${style.align ? ` horizontal="${style.align}"` : ''} vertical="${style.valign || 'center'}"${style.wrap ? ' wrapText="1"' : ''}/>` : ''
    xfs.push(`<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${numFmtId ? ' applyNumberFormat="1"' : ''} applyFont="1"${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${alignment ? ' applyAlignment="1"' : ''}>${alignment}</xf>`)
    cache.set(key, xfs.length - 1)
    return xfs.length - 1
  }
  function xml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
  }
  return { id, xml }
}

function cellXml(cell, row, column, styles) {
  if (cell === null || cell === undefined) return ''
  const value = typeof cell === 'object' ? cell : { v: cell }
  const ref = cellRef(row, column)
  const s = styles.id(value.s)
  const style = s ? ` s="${s}"` : ''
  if (value.f) {
    const cached = value.v === undefined || value.v === null || value.v === '' ? '' : typeof value.v === 'number' ? `<v>${value.v}</v>` : ''
    return `<c r="${ref}"${style}${typeof value.v === 'string' ? ' t="str"' : ''}><f>${escape(value.f)}</f>${cached || (typeof value.v === 'string' ? `<v>${escape(value.v)}</v>` : '')}</c>`
  }
  if (typeof value.v === 'number' && Number.isFinite(value.v)) return `<c r="${ref}"${style}><v>${value.v}</v></c>`
  if (value.v === undefined || value.v === null || value.v === '') return s ? `<c r="${ref}"${style}/>` : ''
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escape(value.v)}</t></is></c>`
}

function sheetXml(sheet, styles) {
  const cols = (sheet.cols || []).map((width, index) => width ? `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>` : '').join('')
  const pane = sheet.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${sheet.freeze.columns}" ySplit="${sheet.freeze.rows}" topLeftCell="${cellRef(sheet.freeze.rows, sheet.freeze.columns)}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>` : ''
  const rows = sheet.rows.map((cells, rowIndex) => {
    const height = sheet.heights?.[rowIndex]
    return `<row r="${rowIndex + 1}"${height ? ` ht="${height}" customHeight="1"` : ''}>${(cells || []).map((cell, column) => cellXml(cell, rowIndex, column, styles)).join('')}</row>`
  }).join('')
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((merge) => `<mergeCell ref="${merge}"/>`).join('')}</mergeCells>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${pane}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData>${merges}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`
}

export function buildXlsx(sheets, { title = '', author = '' } = {}) {
  const styles = styleRegistry()
  const used = new Set()
  const names = sheets.map((sheet) => sheetName(sheet.name, used))
  const sheetFiles = Object.fromEntries(sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, strToU8(sheetXml(sheet, styles))]))
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escape(title)}</dc:title><dc:creator>${escape(author)}</dc:creator></cp:coreProperties>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((name, index) => `<sheet name="${escape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    ...sheetFiles,
  }
  files['xl/styles.xml'] = strToU8(styles.xml())
  return { bytes: zipSync(files, { level: 6 }), sheetNames: names }
}
