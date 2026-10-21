// Draw the primitives used by AnswerSheet directly, preserving its SVG geometry.
// Only the government logo is an image; the QR, markers, bubbles and text stay vector.
export async function drawAnswerSheetPdf(pdf, svg, loadImage) {
  const color = (value) => value === 'white' ? '#ffffff' : value === 'black' ? '#000000' : value
  async function draw(element, transform, inherited = {}) {
    const attr = (name, fallback) => element.getAttribute(name) ?? inherited[name] ?? fallback
    const number = (name, fallback = 0) => Number(element.getAttribute(name) ?? fallback)
    let { x, y, sx, sy } = transform
    const tag = element.tagName.toLowerCase()
    if (tag === 'svg' && element !== svg) {
      const [vx, vy, width, height] = element.getAttribute('viewBox').split(/\s+/).map(Number)
      const nextSx = sx * number('width') / width
      const nextSy = sy * number('height') / height
      x += number('x') * sx - vx * nextSx
      y += number('y') * sy - vy * nextSy
      sx = nextSx
      sy = nextSy
    }
    const fill = attr('fill', '#000000')
    const stroke = attr('stroke', 'none')
    if (fill !== 'none') pdf.setFillColor(color(fill))
    if (stroke !== 'none') { pdf.setDrawColor(color(stroke)); pdf.setLineWidth(Number(attr('stroke-width', 1)) * sx) }
    const style = fill !== 'none' ? stroke !== 'none' ? 'FD' : 'F' : stroke !== 'none' ? 'S' : null
    if (tag === 'svg' || tag === 'g') {
      const properties = { ...inherited }
      for (const name of ['fill', 'stroke', 'stroke-width', 'font-size', 'font-weight', 'text-anchor', 'letter-spacing']) {
        if (element.hasAttribute(name)) properties[name] = element.getAttribute(name)
      }
      for (const child of element.children) await draw(child, { x, y, sx, sy }, properties)
    } else if (tag === 'rect' && style) {
      const args = [x + number('x') * sx, y + number('y') * sy, number('width') * sx, number('height') * sy]
      if (number('rx')) pdf.roundedRect(...args, number('rx') * sx, number('ry', number('rx')) * sy, style)
      else pdf.rect(...args, style)
    } else if (tag === 'circle' && style) {
      pdf.ellipse(x + number('cx') * sx, y + number('cy') * sy, number('r') * sx, number('r') * sy, style)
    } else if (tag === 'line' && stroke !== 'none') {
      pdf.line(x + number('x1') * sx, y + number('y1') * sy, x + number('x2') * sx, y + number('y2') * sy)
    } else if (tag === 'text') {
      pdf.setFont('helvetica', Number(attr('font-weight', 400)) >= 600 ? 'bold' : 'normal')
      pdf.setFontSize(Number(attr('font-size', 16)) * sy * 72 / 25.4)
      pdf.setTextColor(color(fill))
      const anchor = attr('text-anchor', 'start')
      const charSpace = Number(attr('letter-spacing', 0)) * sx
      const spacingWidth = Math.max(0, element.textContent.length - 1) * charSpace
      const spacingOffset = anchor === 'end' ? spacingWidth : anchor === 'middle' ? spacingWidth / 2 : 0
      pdf.text(element.textContent, x + number('x') * sx - spacingOffset, y + number('y') * sy, {
        align: { end: 'right', middle: 'center' }[anchor] || 'left',
        charSpace,
      })
    } else if (tag === 'path') {
      // AnswerSheet represents each filled QR cell with this compact path.
      const path = element.getAttribute('d')
      const cells = [...path.matchAll(/M([\d.]+) ([\d.]+)h1v1h-1z/g)]
      if (!cells.length || cells.map((cell) => cell[0]).join('') !== path) throw new Error('Formato do QR Code não suportado na exportação.')
      for (const cell of cells) pdf.rect(x + Number(cell[1]) * sx, y + Number(cell[2]) * sy, sx, sy, 'F')
    } else if (tag === 'image') {
      const image = await loadImage(element.getAttribute('href'))
      const boxWidth = number('width') * sx
      const boxHeight = number('height') * sy
      const ratio = Math.min(boxWidth / image.width, boxHeight / image.height)
      const width = image.width * ratio
      const height = image.height * ratio
      pdf.addImage(image.data, 'PNG', x + number('x') * sx + (boxWidth - width) / 2, y + number('y') * sy + (boxHeight - height) / 2, width, height, 'government-logo', 'FAST')
    } else {
      throw new Error(`Elemento não suportado na folha de respostas: ${tag}.`)
    }
  }
  const [, , width, height] = svg.getAttribute('viewBox').split(/\s+/).map(Number)
  await draw(svg, { x: 0, y: 0, sx: 210 / width, sy: 297 / height })
}
