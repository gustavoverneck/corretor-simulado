function hash(value) {
  let result = 2166136261
  for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619)
  return result >>> 0
}

function shuffledIndexes(length, seed) {
  const values = Array.from({ length }, (_, index) => index)
  let state = hash(seed) || 1
  for (let index = values.length - 1; index > 0; index -= 1) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    const target = (state >>> 0) % (index + 1)
    ;[values[index], values[target]] = [values[target], values[index]]
  }
  return values
}

export function emptyQuestion(optionCount = 4, index = 0) {
  return { id: `question-${Date.now().toString(36)}-${index}`, statement: '', image: null, imageName: '', alternatives: Array.from({ length: optionCount }, () => ''), correctIndex: 0 }
}

export function resizeQuestions(questions, count, optionCount) {
  return Array.from({ length: count }, (_, index) => {
    const source = questions[index] || emptyQuestion(optionCount, index)
    const alternatives = Array.from({ length: optionCount }, (_, optionIndex) => source.alternatives?.[optionIndex] || '')
    return { ...source, alternatives, correctIndex: Math.min(Number(source.correctIndex) || 0, optionCount - 1) }
  })
}

export function createPrintableVersions(questions, versions, { shuffleQuestions = false, shuffleAlternatives = true } = {}) {
  return versions.map((version, versionIndex) => {
    const questionOrder = shuffleQuestions ? shuffledIndexes(questions.length, `${version.id}:questions`) : questions.map((_, index) => index)
    const printableQuestions = questionOrder.map((questionIndex, printedIndex) => {
      const question = questions[questionIndex]
      const optionOrder = shuffleAlternatives ? shuffledIndexes(question.alternatives.length, `${version.id}:${question.id}:${printedIndex}`) : question.alternatives.map((_, index) => index)
      return { ...question, sourceIndex: questionIndex, alternatives: optionOrder.map((index) => question.alternatives[index]), correctIndex: optionOrder.indexOf(question.correctIndex) }
    })
    return { ...version, questionOrder, questions: printableQuestions, answerKey: printableQuestions.map((question) => String.fromCharCode(65 + question.correctIndex)), versionIndex }
  })
}

const escapeLatex = (value) => String(value || '').replace(/([%&#_{}])/g, '\\$1').replace(/\$/g, '\\textdollar{}')
function richLatex(value) {
  return String(value || '').split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g).filter(Boolean).map((part) => {
    if (part.startsWith('$$')) return `\\[${part.slice(2, -2)}\\]`
    if (part.startsWith('$')) return `\\(${part.slice(1, -1)}\\)`
    return escapeLatex(part)
  }).join('')
}
export function assessmentToLatex(assessment, student, version) {
  const questions = version?.questions || assessment.questions || []
  const body = questions.map((question) => `\\question ${richLatex(question.statement)}\n${question.imageName ? `% Imagem: ${escapeLatex(question.imageName)} (inclua o arquivo com \\includegraphics)` : ''}\n\\begin{choices}\n${question.alternatives.map((alternative, optionIndex) => `${optionIndex === question.correctIndex ? '\\CorrectChoice' : '\\choice'} ${richLatex(alternative)}`).join('\n')}\n\\end{choices}`).join('\n\n')
  return `\\documentclass[12pt,a4paper]{exam}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}\n\\usepackage[brazil]{babel}\n\\usepackage{amsmath,amssymb,graphicx}\n\\usepackage[margin=1.7cm]{geometry}\n\\begin{document}\n\\begin{center}\\Large\\textbf{${escapeLatex(assessment.title)}}\\end{center}\n\\noindent Nome: ${escapeLatex(student?.name || '')} \\hfill Turma: ${escapeLatex(student?.className || '')} \\hfill Versão: ${escapeLatex(version?.label || 'A')}\n\\vspace{.5cm}\n\\begin{questions}\n${body}\n\\end{questions}\n\\end{document}\n`
}
