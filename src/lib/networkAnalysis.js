const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function normalCdf(value) {
  const sign = value < 0 ? -1 : 1
  const x = Math.abs(value) / Math.sqrt(2)
  const t = 1 / (1 + 0.3275911 * x)
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return 0.5 * (1 + sign * erf)
}

export function pearsonWithInference(first, second, confidence = 0.95) {
  const pairs = first.map((value, index) => [Number(value), Number(second[index])]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
  const n = pairs.length
  if (n < 4) return { r: null, n, p: null, ci: [null, null], significant: false }
  const meanA = pairs.reduce((sum, [a]) => sum + a, 0) / n
  const meanB = pairs.reduce((sum, [, b]) => sum + b, 0) / n
  let covariance = 0; let varianceA = 0; let varianceB = 0
  pairs.forEach(([a, b]) => { covariance += (a - meanA) * (b - meanB); varianceA += (a - meanA) ** 2; varianceB += (b - meanB) ** 2 })
  if (!varianceA || !varianceB) return { r: null, n, p: null, ci: [null, null], significant: false }
  const r = clamp(covariance / Math.sqrt(varianceA * varianceB), -0.999999, 0.999999)
  const z = 0.5 * Math.log((1 + r) / (1 - r))
  const critical = confidence >= 0.99 ? 2.576 : confidence >= 0.95 ? 1.96 : 1.645
  const se = 1 / Math.sqrt(n - 3)
  const ci = [Math.tanh(z - critical * se), Math.tanh(z + critical * se)]
  const statistic = Math.abs(r) * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r))
  const p = 2 * (1 - normalCdf(statistic))
  return { r, n, p: clamp(p, 0, 1), ci, significant: p < (1 - confidence) }
}

function answerCode(answer) {
  return Array.isArray(answer?.selected) ? [...answer.selected].sort().join('+') : ''
}

function similarity(first, second, indexes) {
  let same = 0; let comparable = 0
  indexes.forEach((index) => {
    const a = answerCode(first.answers[index]); const b = answerCode(second.answers[index])
    if (!a && !b) return
    comparable += 1
    if (a === b) same += 1
  })
  return { value: comparable ? same / comparable : 0, comparable }
}

function labelCommunities(nodeIds, edges) {
  const labels = new Map(nodeIds.map((id) => [id, id]))
  const adjacency = new Map(nodeIds.map((id) => [id, []]))
  edges.forEach((edge) => { adjacency.get(edge.source)?.push([edge.target, edge.weight]); adjacency.get(edge.target)?.push([edge.source, edge.weight]) })
  for (let iteration = 0; iteration < 30; iteration += 1) {
    let changed = false
    nodeIds.forEach((id) => {
      const scores = new Map()
      adjacency.get(id).forEach(([neighbor, weight]) => scores.set(labels.get(neighbor), (scores.get(labels.get(neighbor)) || 0) + weight))
      const selected = [...scores].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0]
      if (selected !== undefined && selected !== labels.get(id)) { labels.set(id, selected); changed = true }
    })
    if (!changed) break
  }
  const unique = [...new Set(labels.values())]
  return new Map(nodeIds.map((id) => [id, unique.indexOf(labels.get(id))]))
}

function graphMetrics(nodes, edges, communities) {
  const ids = nodes.map((node) => node.id)
  const adjacency = new Map(ids.map((id) => [id, new Map()]))
  edges.forEach(({ source, target, weight }) => { adjacency.get(source)?.set(target, weight); adjacency.get(target)?.set(source, weight) })
  const centrality = new Map(ids.map((id) => [id, { degree: adjacency.get(id).size / Math.max(1, ids.length - 1), closeness: 0, betweenness: 0, eigenvector: 1 / Math.max(1, ids.length) }]))
  ids.forEach((source) => {
    const queue = [source]; const distance = new Map([[source, 0]]); const paths = new Map([[source, 1]]); const predecessors = new Map(ids.map((id) => [id, []])); const order = []
    while (queue.length) {
      const current = queue.shift(); order.push(current)
      adjacency.get(current).forEach((_weight, neighbor) => {
        if (!distance.has(neighbor)) { distance.set(neighbor, distance.get(current) + 1); queue.push(neighbor) }
        if (distance.get(neighbor) === distance.get(current) + 1) { paths.set(neighbor, (paths.get(neighbor) || 0) + paths.get(current)); predecessors.get(neighbor).push(current) }
      })
    }
    const reachable = [...distance.values()].reduce((sum, value) => sum + value, 0)
    centrality.get(source).closeness = reachable ? (distance.size - 1) / reachable : 0
    const dependency = new Map(ids.map((id) => [id, 0]))
    order.reverse().forEach((node) => { predecessors.get(node).forEach((previous) => dependency.set(previous, dependency.get(previous) + (paths.get(previous) / paths.get(node)) * (1 + dependency.get(node)))); if (node !== source) centrality.get(node).betweenness += dependency.get(node) / 2 })
  })
  const betweennessScale = Math.max(1, ((ids.length - 1) * (ids.length - 2)) / 2)
  centrality.forEach((value) => { value.betweenness /= betweennessScale })
  for (let iteration = 0; iteration < 25; iteration += 1) {
    const next = new Map(ids.map((id) => [id, [...adjacency.get(id)].reduce((sum, [neighbor, weight]) => sum + weight * centrality.get(neighbor).eigenvector, 0)]))
    const norm = Math.sqrt([...next.values()].reduce((sum, value) => sum + value * value, 0)) || 1
    ids.forEach((id) => { centrality.get(id).eigenvector = next.get(id) / norm })
  }
  const degreeWeight = new Map(ids.map((id) => [id, [...adjacency.get(id).values()].reduce((sum, value) => sum + value, 0)]))
  const totalWeight = edges.reduce((sum, edge) => sum + edge.weight, 0)
  const modularity = totalWeight ? edges.reduce((sum, edge) => communities.get(edge.source) === communities.get(edge.target) ? sum + edge.weight - (degreeWeight.get(edge.source) * degreeWeight.get(edge.target) / (2 * totalWeight)) : sum, 0) / totalWeight : 0
  return { density: ids.length > 1 ? (2 * edges.length) / (ids.length * (ids.length - 1)) : 0, modularity, centrality }
}

export function questionCategory(assessment, index, dimension = 'area') {
  const sources = dimension === 'skill' ? ['questionSkills', 'skills', 'habilidades'] : dimension === 'descriptor' ? ['questionDescriptors', 'descriptors', 'descritores'] : dimension === 'content' ? ['questionContents', 'contents', 'conteudos'] : ['questionAreas']
  for (const key of sources) if (Array.isArray(assessment?.[key]) && assessment[key][index]) return assessment[key][index]
  return dimension === 'area' ? assessment?.subjects?.[0] || 'Sem área' : `Sem ${dimension === 'skill' ? 'habilidade' : dimension === 'descriptor' ? 'descritor' : 'conteúdo'}`
}

export function buildStudentNetwork({ assessment, submissions, students, classId = 'all', dimension = 'area', category = 'all', threshold = 0.65 }) {
  const rows = submissions.filter((row) => row.assessmentId === assessment.id && Array.isArray(row.answers) && (classId === 'all' || row.classId === classId))
  const studentMap = new Map(students.map((student) => [student.id, student]))
  const indexes = Array.from({ length: assessment.questionCount }, (_, index) => index).filter((index) => category === 'all' || questionCategory(assessment, index, dimension) === category)
  const nodes = rows.map((submission) => ({ id: submission.studentId, label: studentMap.get(submission.studentId)?.name || submission.studentId, submission })).filter((node) => studentMap.has(node.id))
  const edges = []
  nodes.forEach((first, index) => nodes.slice(index + 1).forEach((second) => { const match = similarity(first.submission, second.submission, indexes); if (match.comparable >= 3 && match.value >= threshold) edges.push({ source: first.id, target: second.id, weight: match.value, observations: match.comparable }) }))
  const communities = labelCommunities(nodes.map((node) => node.id), edges)
  const metrics = graphMetrics(nodes, edges, communities)
  nodes.forEach((node) => { node.community = communities.get(node.id); node.centrality = metrics.centrality.get(node.id) })
  return { nodes, edges, ...metrics, communityCount: new Set(communities.values()).size, questionIndexes: indexes }
}

export function buildQuestionNetwork({ assessment, submissions, classId = 'all', dimension = 'area', category = 'all', threshold = 0.2, confidence = 0.95 }) {
  const rows = submissions.filter((row) => row.assessmentId === assessment.id && Array.isArray(row.answers) && (classId === 'all' || row.classId === classId))
  const indexes = Array.from({ length: assessment.questionCount }, (_, index) => index).filter((index) => category === 'all' || questionCategory(assessment, index, dimension) === category)
  const nodes = indexes.map((index) => ({ id: `q${index + 1}`, label: `Q${index + 1}`, index, category: questionCategory(assessment, index, dimension), correctRate: rows.length ? rows.filter((row) => row.answers[index]?.status === 'correct').length / rows.length : 0 }))
  const edges = []
  nodes.forEach((first, index) => nodes.slice(index + 1).forEach((second) => {
    const stats = pearsonWithInference(rows.map((row) => row.answers[first.index]?.status === 'correct' ? 1 : 0), rows.map((row) => row.answers[second.index]?.status === 'correct' ? 1 : 0), confidence)
    if (stats.r !== null && Math.abs(stats.r) >= threshold) edges.push({ source: first.id, target: second.id, weight: Math.abs(stats.r), correlation: stats.r, ...stats })
  }))
  const communities = labelCommunities(nodes.map((node) => node.id), edges)
  const metrics = graphMetrics(nodes, edges, communities)
  nodes.forEach((node) => { node.community = communities.get(node.id); node.centrality = metrics.centrality.get(node.id) })
  return { nodes, edges, ...metrics, communityCount: new Set(communities.values()).size }
}

export function buildBipartiteNetwork({ assessment, submissions, students, classId = 'all', dimension = 'area', category = 'all' }) {
  const studentMap = new Map(students.map((student) => [student.id, student]))
  const rows = submissions.filter((row) => row.assessmentId === assessment.id && Array.isArray(row.answers) && studentMap.has(row.studentId) && (classId === 'all' || row.classId === classId))
  const indexes = Array.from({ length: assessment.questionCount }, (_, index) => index).filter((index) => category === 'all' || questionCategory(assessment, index, dimension) === category)
  const studentNodes = rows.map((row) => ({ id: row.studentId, label: studentMap.get(row.studentId).name, type: 'student' }))
  const questionNodes = indexes.map((index) => ({ id: `q${index + 1}`, label: `Q${index + 1}`, type: 'question', category: questionCategory(assessment, index, dimension) }))
  const edges = rows.flatMap((row) => indexes.filter((index) => row.answers[index]?.status !== 'blank').map((index) => ({ source: row.studentId, target: `q${index + 1}`, weight: row.answers[index]?.status === 'correct' ? 1 : 0.45, status: row.answers[index]?.status })))
  return { nodes: [...studentNodes, ...questionNodes], edges, studentCount: studentNodes.length, questionCount: questionNodes.length, density: studentNodes.length && questionNodes.length ? edges.length / (studentNodes.length * questionNodes.length) : 0 }
}

export function buildTemporalAnalysis({ assessments, submissions, students, classId = 'all', threshold = 0.65 }) {
  return assessments.filter((assessment) => submissions.some((row) => row.assessmentId === assessment.id && (classId === 'all' || row.classId === classId))).sort((a, b) => String(a.date).localeCompare(String(b.date))).map((assessment) => {
    const network = buildStudentNetwork({ assessment, submissions, students, classId, threshold })
    const rows = submissions.filter((row) => row.assessmentId === assessment.id && (classId === 'all' || row.classId === classId))
    return { assessmentId: assessment.id, title: assessment.title, date: assessment.date, density: network.density, modularity: network.modularity, communities: network.communityCount, meanScore: rows.length ? rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / rows.length : 0, students: rows.length }
  })
}

export function summarizeBehavior(submissions) {
  const totalAnswers = submissions.reduce((sum, row) => sum + (row.answers?.length || 0), 0)
  const count = (status) => submissions.reduce((sum, row) => sum + (row.answers?.filter((answer) => answer.status === status).length || 0), 0)
  const confidences = submissions.map((row) => Number(row.confidence)).filter(Number.isFinite)
  return { sheets: submissions.length, totalAnswers, blankRate: totalAnswers ? count('blank') / totalAnswers : 0, multipleRate: totalAnswers ? count('multiple') / totalAnswers : 0, reviewRate: submissions.length ? submissions.filter((row) => row.status === 'Revisar').length / submissions.length : 0, meanConfidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null }
}
