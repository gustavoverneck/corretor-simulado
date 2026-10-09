const theme = { ink: '#203B32', green: '#47776A', muted: '#667A71', light: '#F0F5F2', line: '#DCE6DF', white: '#FFFFFF' }
const formats = { a4: [595.28, 841.89], slides: [960, 540] }

function rgb(hex) { return hex.replace('#', '').match(/../g).map((part) => parseInt(part, 16)) }

// A shared page layout keeps the PDF and editable PowerPoint consistent.
export function createReportScenes(report, format, measure) {
  const [width, height] = formats[format] || formats.slides
  const wide = width > height
  const margin = 40
  const contentWidth = width - margin * 2
  const scenes = []
  const font = wide ? 14 : 11
  function text(scene, value, x, y, w, size = font, color = theme.ink, bold = false) {
    const lines = measure(String(value), w, size, bold)
    const h = lines.length * size * 1.3
    scene.elements.push({ type: 'text', lines, x, y, w, h, size, color, bold })
    return h
  }
  function rect(scene, x, y, w, h, color) { scene.elements.push({ type: 'rect', x, y, w, h, color }) }
  function circle(scene, cx, cy, radius, color) { scene.elements.push({ type: 'circle', x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2, color }) }
  function icon(scene, kind, x, y, color) {
    if (kind === 'target') {
      circle(scene, x, y, 14, color)
      circle(scene, x, y, 10, theme.white)
      circle(scene, x, y, 6, color)
      circle(scene, x, y, 2, theme.white)
    } else if (kind === 'group') {
      for (const offset of [-10, 0, 10]) { circle(scene, x + offset, y - 6, 4, color); rect(scene, x + offset - 3, y + 1, 6, 10, color) }
    } else scene.elements.push({ type: 'star', x: x - 14, y: y - 14, w: 28, h: 28, color })
  }
  function short(value, w, size) {
    let result = value
    while (measure(result, w, size, false).length > 1 && result.length > 4) result = `${result.slice(0, -4)}...`
    return result
  }
  function page(source, continuation = false) {
    const scene = { width, height, elements: [] }
    rect(scene, 0, 0, width, 7, theme.green)
    text(scene, short(report.school, contentWidth - 125, 9), margin, 23, contentWidth - 125, 9, theme.muted, true)
    text(scene, 'ANÁLISE DE RESULTADOS', width - margin - 125, 23, 125, 8, theme.green, true)
    const titleHeight = text(scene, `${source.title}${continuation ? ' · continuação' : ''}`, margin, 57, contentWidth, wide ? 28 : 25, theme.ink, true)
    const subtitleY = 57 + titleHeight + 8
    const subtitleHeight = text(scene, source.subtitle, margin, subtitleY, contentWidth, wide ? 12 : 10, theme.muted)
    scene.startY = subtitleY + subtitleHeight + 24
    scenes.push(scene)
    return scene
  }
  function notes(scene, note) {
    const lines = measure(note, contentWidth - 24, 9, false)
    const h = lines.length * 11.7 + 20
    rect(scene, margin, height - 54 - h, contentWidth, h, theme.light)
    text(scene, note, margin + 12, height - 44 - h, contentWidth - 24, 9, theme.muted)
    return height - 66 - h
  }

  report.pages.forEach((source) => {
    if (source.type === 'overview') {
      const scene = page({ ...source, title: report.title })
      const centerX = margin + 82
      const centerY = scene.startY + 82
      for (let index = 0; index < 80; index++) {
        const angle = index / 80 * Math.PI * 2 - Math.PI / 2
        circle(scene, centerX + Math.cos(angle) * 65, centerY + Math.sin(angle) * 65, 4, index / 80 * 100 < report.totals.score ? theme.green : theme.line)
      }
      text(scene, `${report.totals.score}%`, centerX - 47, centerY - 18, 94, 33, theme.green, true)
      text(scene, 'média de acertos', centerX - 49, centerY + 24, 110, 10, theme.muted)
      const columns = wide ? 3 : 1
      const gap = 12
      const cardX = margin + 195
      const cardWidth = (contentWidth - 195 - gap * (columns - 1)) / columns
      const cards = [
        ['ESTUDANTES', report.totals.students, 'participaram das atividades'],
        ['PARTICIPAÇÕES', report.totals.count, 'nos simulados escolhidos'],
        ['A CONFERIR', report.totals.review, 'marcações de respostas'],
      ]
      cards.forEach(([label, value, detail], index) => {
        const x = cardX + (index % columns) * (cardWidth + gap)
        const y = scene.startY + Math.floor(index / columns) * 65
        rect(scene, x, y, cardWidth, wide ? 160 : 57, theme.light)
        text(scene, label, x + 14, y + 12, cardWidth - 28, 8, theme.muted, true)
        text(scene, value, x + 14, y + (wide ? 49 : 27), cardWidth - 28, wide ? 38 : 23, theme.green, true)
        if (wide) text(scene, detail, x + 14, y + 110, cardWidth - 28, 11, theme.muted)
      })
      let y = scene.startY + (wide ? 187 : 225)
      y += text(scene, 'Em poucas palavras', margin, y, contentWidth, 18, theme.ink, true) + 10
      y += text(scene, source.overview, margin, y, contentWidth, wide ? 15 : 13) + 20
      text(scene, `${report.location ? `${report.location} · ` : ''}${report.date}`, margin, Math.max(y, height - 98), contentWidth, 10, theme.muted)
    } else if (source.type === 'distribution') {
      const scene = page(source)
      notes(scene, source.note)
      const spacing = wide ? 22 : 19
      const gridWidth = spacing * 10
      const gridX = wide ? margin + 20 : margin + (contentWidth - gridWidth) / 2
      const gridY = scene.startY + 10
      const total = source.items.reduce((sum, item) => sum + item.count, 0)
      const shares = source.items.map((item, index) => ({ index, cells: Math.floor(item.count / total * 100), rest: item.count / total * 100 % 1 }))
      const remaining = 100 - shares.reduce((sum, item) => sum + item.cells, 0)
      ;[...shares].sort((a, b) => b.rest - a.rest).slice(0, remaining).forEach((item) => { item.cells++ })
      const pointColors = shares.flatMap((item) => Array(item.cells).fill(source.items[item.index].color))
      pointColors.forEach((color, index) => circle(scene, gridX + (index % 10) * spacing + spacing / 2, gridY + Math.floor(index / 10) * spacing + spacing / 2, spacing * .34, color))
      const legendX = wide ? margin + 285 : margin
      const legendY = wide ? scene.startY : gridY + gridWidth + 30
      const legendWidth = wide ? contentWidth - 285 : (contentWidth - 12) / 2
      source.items.forEach((item, index) => {
        const x = legendX + (wide ? 0 : index % 2 * (legendWidth + 12))
        const y = legendY + (wide ? index * 66 : Math.floor(index / 2) * 108)
        rect(scene, x, y, legendWidth, wide ? 57 : 96, theme.light)
        circle(scene, x + 17, y + 18, 5, item.color)
        text(scene, item.label, x + 30, y + 10, legendWidth - 42, wide ? 13 : 10, theme.ink, true)
        text(scene, `${item.value}%`, x + 14, y + (wide ? 30 : 40), 70, wide ? 17 : 23, item.color, true)
        text(scene, item.detail, x + (wide ? 85 : 14), y + (wide ? 33 : 73), legendWidth - (wide ? 100 : 28), 10, theme.muted)
      })
    } else if (source.type === 'highlights') {
      let scene = page(source)
      let y = scene.startY
      const colors = ['#EAF4EF', '#FCF1E7', '#EAF0F5']
      const cardWidth = wide ? (contentWidth - 24) / 3 : contentWidth
      source.items.forEach((item, index) => {
        const x = margin + (wide ? index * (cardWidth + 12) : 0)
        if (wide) {
          const cardHeight = height - 70 - scene.startY
          rect(scene, x, y, cardWidth, cardHeight, colors[index])
          icon(scene, item.icon, x + 28, y + 32, item.color)
          const labelHeight = text(scene, item.label, x + 55, y + 20, cardWidth - 70, 15, theme.ink, true)
          let cursor = y + Math.max(78, labelHeight + 32)
          cursor += text(scene, item.metric, x + 18, cursor, cardWidth - 36, 34, item.color, true) + 7
          cursor += text(scene, item.caption, x + 18, cursor, cardWidth - 36, 11, theme.muted) + 18
          text(scene, item.text, x + 18, cursor, cardWidth - 36, 13, theme.ink)
        } else {
          const labelHeight = measure(item.label, cardWidth - 170, 15, true).length * 19.5
          const bodyHeight = measure(item.text, cardWidth - 146, 12, false).length * 15.6
          const captionHeight = measure(item.caption, 104, 10, false).length * 13
          const cardHeight = Math.max(92 + captionHeight, 46 + labelHeight + bodyHeight)
          if (y + cardHeight > height - 70) { scene = page(source, true); y = scene.startY }
          rect(scene, x, y, cardWidth, cardHeight, colors[index])
          icon(scene, item.icon, x + 142, y + 29, item.color)
          text(scene, item.label, x + 165, y + 18, cardWidth - 180, 15, theme.ink, true)
          text(scene, item.metric, x + 18, y + 24, 110, 29, item.color, true)
          text(scene, item.caption, x + 18, y + 70, 104, 10, theme.muted)
          text(scene, item.text, x + 130, y + labelHeight + 32, cardWidth - 146, 12, theme.ink)
          y += cardHeight + 14
        }
      })
    } else if (source.type === 'steps') {
      let scene = page(source)
      let y = scene.startY
      const cardWidth = wide ? (contentWidth - 32) / 3 : contentWidth
      source.items.forEach((item, index) => {
        const x = margin + (wide ? index * (cardWidth + 16) : 0)
        const textWidth = cardWidth - (wide ? 36 : 108)
        const labelHeight = measure(item.label, textWidth, 17, true).length * 22.1
        const bodyHeight = measure(item.text, textWidth, 13, false).length * 16.9
        const cardHeight = wide ? Math.max(260, 120 + labelHeight + bodyHeight) : Math.max(115, 46 + labelHeight + bodyHeight)
        if (!wide && y + cardHeight > height - 70) { scene = page(source, true); y = scene.startY }
        rect(scene, x, y, cardWidth, cardHeight, theme.light)
        circle(scene, x + (wide ? 42 : 38), y + 37, 22, theme.green)
        text(scene, String(index + 1), x + (wide ? 35 : 31), y + 23, 22, 23, theme.white, true)
        const bodyX = x + (wide ? 18 : 90)
        const headingY = y + (wide ? 82 : 19)
        text(scene, item.label, bodyX, headingY, textWidth, 17, theme.ink, true)
        text(scene, item.text, bodyX, headingY + labelHeight + 16, textWidth, 13, theme.ink)
        if (!wide) y += cardHeight + 15
      })
    } else if (source.type === 'bars') {
      let scene = page(source)
      let limit = notes(scene, source.note)
      let y = scene.startY
      if (!source.items.length) text(scene, 'Não há dados detalhados disponíveis para esta análise no recorte selecionado.', margin, y, contentWidth, font, theme.muted)
      source.items.forEach((item) => {
        const labelHeight = measure(item.label, contentWidth - 90, font, true).length * font * 1.3
        const detailHeight = measure(item.detail, contentWidth, 10, false).length * 13
        const rowHeight = labelHeight + detailHeight + 37
        if (y + rowHeight > limit) { scene = page(source, true); limit = notes(scene, source.note); y = scene.startY }
        text(scene, item.label, margin, y, contentWidth - 90, font, theme.ink, true)
        text(scene, item.value === null ? 'Sem dados' : `${item.value}%`, width - margin - 78, y, 78, item.value === null ? 10 : font, theme.green, true)
        const barY = y + labelHeight + 7
        rect(scene, margin, barY, contentWidth, 16, theme.line)
        if (item.value > 0) rect(scene, margin, barY, contentWidth * Math.max(0, Math.min(100, item.value)) / 100, 16, item.color || theme.green)
        text(scene, item.detail, margin, barY + 23, contentWidth, 10, theme.muted)
        y += rowHeight
      })
    } else {
      let scene = page(source)
      let y = scene.startY
      const limit = height - 70
      const bodyFont = wide ? 13 : font
      source.items.forEach((item) => {
        const labelHeight = measure(item.label, contentWidth - 32, bodyFont, true).length * bodyFont * 1.3
        const lines = measure(item.text, contentWidth - 32, bodyFont, false)
        const fullHeight = labelHeight + lines.length * bodyFont * 1.3 + 20
        if (y + fullHeight > limit && fullHeight <= limit - scene.startY) { scene = page(source, true); y = scene.startY }
        let offset = 0
        while (offset < lines.length) {
          const minimum = labelHeight + bodyFont * 1.3 + 20
          if (y + minimum > limit) { scene = page(source, true); y = scene.startY }
          const availableLines = Math.max(1, Math.floor((limit - y - labelHeight - 20) / (bodyFont * 1.3)))
          const chunk = lines.slice(offset, offset + availableLines)
          const boxHeight = labelHeight + chunk.length * bodyFont * 1.3 + 20
          rect(scene, margin, y, contentWidth, boxHeight, theme.light)
          text(scene, `${item.label}${offset ? ' · continuação' : ''}`, margin + 16, y + 8, contentWidth - 32, bodyFont, theme.green, true)
          scene.elements.push({ type: 'text', lines: chunk, x: margin + 16, y: y + labelHeight + 14, w: contentWidth - 32, h: chunk.length * bodyFont * 1.3, size: bodyFont, color: theme.ink, bold: false })
          y += boxHeight + 10
          offset += chunk.length
        }
      })
    }
  })
  scenes.forEach((scene, index) => {
    rect(scene, margin, height - 41, contentWidth, .6, theme.line)
    text(scene, short(report.title, contentWidth - 85, 8), margin, height - 30, contentWidth - 85, 8, theme.muted)
    text(scene, `${index + 1} / ${scenes.length}`, width - margin - 65, height - 30, 65, 8, theme.muted)
  })
  return scenes
}

export async function generateReportFile(report, output = 'a4') {
  const { jsPDF } = await import('jspdf')
  const layout = output === 'a4' ? 'a4' : 'slides'
  const [width, height] = formats[layout]
  const pdf = new jsPDF({ orientation: layout === 'a4' ? 'portrait' : 'landscape', unit: 'pt', format: [width, height], compress: true, putOnlyUsedFonts: true })
  const measure = (value, w, size, bold) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    return pdf.splitTextToSize(value, w)
  }
  const scenes = createReportScenes(report, layout, measure)
  const name = `relatorio-resultados-${report.dateKey}`
  if (output === 'pptx') {
    const { default: PptxGenJS } = await import('pptxgenjs')
    const presentation = new PptxGenJS()
    presentation.layout = 'LAYOUT_WIDE'
    presentation.author = report.school
    presentation.subject = 'Análise dos resultados de simulados'
    presentation.title = report.title
    presentation.lang = 'pt-BR'
    presentation.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial', lang: 'pt-BR' }
    scenes.forEach((scene) => {
      const slide = presentation.addSlide()
      slide.background = { color: 'FFFFFF' }
      scene.elements.forEach((element) => {
        if (['rect', 'circle', 'star'].includes(element.type)) slide.addShape(element.type === 'circle' ? presentation.ShapeType.ellipse : element.type === 'star' ? presentation.ShapeType.star5 : presentation.ShapeType.rect, { x: element.x / 72, y: element.y / 72, w: element.w / 72, h: element.h / 72, fill: { color: element.color.slice(1) }, line: { color: element.color.slice(1), transparency: 100 } })
        else slide.addText(element.lines.join('\n'), { x: element.x / 72, y: element.y / 72, w: element.w / 72, h: (element.h + 3) / 72, fontFace: 'Arial', fontSize: element.size, color: element.color.slice(1), bold: element.bold, margin: 0, breakLine: false, valign: 'top', fit: 'shrink', lineSpacingMultiple: 1.1, paraSpaceAfterPt: 0 })
      })
    })
    const content = await presentation.write({ outputType: 'arraybuffer', compression: true })
    return { blob: new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), filename: `${name}.pptx`, pages: scenes.length }
  }
  pdf.setProperties({ title: report.title, author: report.school, subject: 'Análise dos resultados de simulados', creator: 'Corretor de Simulados' })
  scenes.forEach((scene, index) => {
    if (index) pdf.addPage([width, height], layout === 'a4' ? 'portrait' : 'landscape')
    scene.elements.forEach((element) => {
      if (['rect', 'circle', 'star'].includes(element.type)) {
        pdf.setFillColor(...rgb(element.color))
        if (element.type === 'circle') pdf.ellipse(element.x + element.w / 2, element.y + element.h / 2, element.w / 2, element.h / 2, 'F')
        else if (element.type === 'star') {
          const points = Array.from({ length: 10 }, (_, index) => {
            const angle = index * Math.PI / 5 - Math.PI / 2
            const radius = element.w / 2 * (index % 2 ? .45 : 1)
            return [element.x + element.w / 2 + Math.cos(angle) * radius, element.y + element.h / 2 + Math.sin(angle) * radius]
          })
          pdf.lines(points.slice(1).map((point, index) => [point[0] - points[index][0], point[1] - points[index][1]]), points[0][0], points[0][1], [1, 1], 'F', true)
        } else pdf.rect(element.x, element.y, element.w, element.h, 'F')
      } else {
        pdf.setFont('helvetica', element.bold ? 'bold' : 'normal')
        pdf.setFontSize(element.size)
        pdf.setTextColor(...rgb(element.color))
        pdf.text(element.lines, element.x, element.y + element.size * .9, { lineHeightFactor: 1.3 })
      }
    })
  })
  return { blob: pdf.output('blob'), filename: `${name}-${layout === 'a4' ? 'a4' : 'apresentacao'}.pdf`, pages: scenes.length }
}
