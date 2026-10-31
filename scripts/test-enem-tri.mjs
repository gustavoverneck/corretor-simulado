import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildVersionTri, compactDataset, eapTheta, ENEM_AREAS, ENEM_SCALE, expandDataset, matchVersion, parseItensProva, provaSequence } from '../src/lib/enemTri.js'
import { computeTriScores, enemItemGroup, triClassIds } from '../src/lib/tri.js'
import { calculateQuestionResults } from '../src/lib/results.js'

const dataset = parseItensProva(readFileSync('data/enem/2025/itens.csv', 'utf8'), 2025)
const bundled = expandDataset(JSON.parse(readFileSync('src/data/enem2025.json', 'utf8')))
assert.deepEqual(bundled, expandDataset(compactDataset(dataset)), 'o arquivo do app deve estar atualizado com o ITENS_PROVA')
const byCo = new Map(dataset.provas.map((prova) => [prova.co, prova]))

// 1. As notas oficiais do ENEM 2025 são reproduzidas a partir das respostas.
const rows = readFileSync('data/enem/2025/amostra.csv', 'utf8').trim().split(/\r?\n/)
const header = rows[0].split(';')
let checked = 0
let worst = 0
rows.slice(1).forEach((line) => {
  const cell = Object.fromEntries(line.split(';').map((value, index) => [header[index], value]))
  Object.keys(ENEM_AREAS).forEach((area) => {
    const prova = byCo.get(cell[`CO_PROVA_${area}`])
    const official = Number(cell[`NU_NOTA_${area}`])
    if (!prova || !official || Number(prova.co) > 1486) return
    const answers = cell[`TX_RESPOSTAS_${area}`]
    const responses = provaSequence(prova, Number(cell.TP_LINGUA)).map((item, index) => ({ item, correct: answers[index] === item.key })).filter(({ item }) => !item.abandoned && item.a !== null)
    const { mean, sd } = ENEM_SCALE[area]
    worst = Math.max(worst, Math.abs(mean + sd * eapTheta(responses) - official))
    checked += 1
  })
})
assert.ok(checked > 7000, `amostra pequena demais: ${checked}`)
assert.ok(worst < 1.5, `diferença máxima para a nota oficial: ${worst.toFixed(2)}`)

// 2. Versões do simulado (LC + CH em 90 questões) são reconhecidas por cor e língua.
const lcAzul = byCo.get('1459')
const chAmarela = byCo.get('1448')
const keyOf = (prova, language) => provaSequence(prova, language).map((item) => item.key)
const espanhol = [...keyOf(lcAzul, 1), ...keyOf(chAmarela, 0)]
espanhol[10] = espanhol[10] === 'A' ? 'B' : 'A' // uma diferença ainda casa (≥ 90%)
const segments = matchVersion(espanhol, dataset)
assert.deepEqual(segments.map((item) => [item.offset, item.prova.co, item.language]), [[0, '1459', 1], [45, '1448', null]])
assert.equal(matchVersion(Array.from({ length: 45 }, () => 'A'), dataset).length, 0)

// 3. Nota no modo ENEM, só na turma escolhida.
const tri = buildVersionTri(espanhol, dataset)
assert.equal(tri.items.length, 90)
const assessment = {
  id: 'enem', classIds: ['c1', 'c2'], questionCount: 90, answerKey: espanhol,
  answerKeyVersions: [{ id: 'v-esp', label: 'Azul espanhol', answerKey: espanhol }],
  tri: { enabled: true, mode: 'enem', classIds: ['c1'], enem: { source: 'ENEM 2025', versions: [{ versionId: 'v-esp', label: 'Azul espanhol', keySignature: JSON.stringify(espanhol), ...tri }] } },
}
assert.deepEqual(triClassIds(assessment), ['c1'])
const sheet = (id, classId, correctCount) => ({
  id, assessmentId: 'enem', classId, answerKeyVersionId: 'v-esp', answerKeySnapshot: espanhol,
  answers: espanhol.map((_, index) => ({ status: index % 45 < correctCount ? 'correct' : 'wrong' })),
})
const { scores, groups } = computeTriScores(assessment, [sheet('s1', 'c1', 40), sheet('s2', 'c1', 10), sheet('s3', 'c2', 40)])
assert.equal(scores.size, 2, 'a turma fora da seleção não recebe nota')
assert.ok(scores.get('s1').score > scores.get('s2').score + 150)
assert.deepEqual(Object.keys(scores.get('s1').areas), [ENEM_AREAS.LC, ENEM_AREAS.CH])
assert.equal(scores.get('s1').scale, 'enem')
assert.equal(groups[0].status, 'ok')
assert.equal(groups[0].scored, 2)

// Sem parâmetros aplicados, a versão aparece como não reconhecida.
const pending = computeTriScores({ ...assessment, tri: { ...assessment.tri, enem: null } }, [sheet('s1', 'c1', 40)])
assert.equal(pending.scores.size, 0)
assert.equal(pending.groups[0].status, 'unmatched')

// 4. Cores juntadas pela questão oficial (análise por questão).
const chAzul = byCo.get('1447')
const azulIng = [...keyOf(lcAzul, 0), ...keyOf(chAzul, 0)]
const amarelaEsp = [...keyOf(byCo.get('1460'), 1), ...keyOf(chAmarela, 0)]
const versionsDef = [{ id: 'azul', label: 'Azul inglês', answerKey: azulIng }, { id: 'amarela', label: 'Amarela espanhol', answerKey: amarelaEsp }]
const multi = {
  id: 'multi', classIds: ['c1'], questionCount: 90, answerKey: azulIng, answerKeyVersions: versionsDef,
  questionAreas: Array.from({ length: 90 }, (_, index) => index < 45 ? ENEM_AREAS.LC : ENEM_AREAS.CH),
  tri: { enabled: true, mode: 'enem', enem: { versions: versionsDef.map((version) => ({ versionId: version.id, label: version.label, keySignature: JSON.stringify(version.answerKey), ...buildVersionTri(version.answerKey, dataset) })) } },
}
// O aluno da azul acerta só a 1ª questão de Humanas da azul; a da amarela acerta a mesma questão oficial, que está em outra posição.
const firstCh = multi.tri.enem.versions[0].items[45].item
const amarelaPosition = multi.tri.enem.versions[1].items.findIndex((item) => item?.item === firstCh)
const multiSheet = (id, version, correctAt) => ({ id, assessmentId: 'multi', classId: 'c1', answerKeyVersionId: version, answers: Array.from({ length: 90 }, (_, index) => ({ status: index === correctAt ? 'correct' : 'wrong' })) })
const unified = enemItemGroup(multi, [multiSheet('x1', 'azul', 45), multiSheet('x2', 'amarela', amarelaPosition)])
assert.equal(unified.referenceLabel, 'Azul inglês')
assert.equal(unified.excluded, 5, 'as 5 de língua estrangeira ficam fora')
assert.equal(unified.questions.length, 85)
const chIndex = unified.questions.findIndex((question) => question.code === firstCh)
assert.equal(unified.questions[chIndex].number, 46, 'numeração da azul')
assert.deepEqual(unified.submissions.map((submission) => submission.answers[chIndex].status), ['correct', 'correct'])
const chart = calculateQuestionResults([multi], [multiSheet('x1', 'azul', 45), multiSheet('x2', 'amarela', amarelaPosition)])
assert.equal(chart.find((item) => item.number === 46).score, 100, 'gráfico por questão junta as cores')

console.log(`ENEM TRI: ${checked} notas oficiais reproduzidas (diferença máx. ${worst.toFixed(2)}), versões e turmas ok`)
