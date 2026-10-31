// Gera src/data/enem<ano>.json a partir do ITENS_PROVA dos microdados do INEP.
// Uso: node scripts/build-enem-params.mjs data/enem/2025/itens.csv 2025
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { compactDataset, parseItensProva } from '../src/lib/enemTri.js'

const [, , input, year] = process.argv
if (!input || !year) throw new Error('Uso: node scripts/build-enem-params.mjs <ITENS_PROVA.csv> <ano>')
const parsed = parseItensProva(readFileSync(input, 'utf8'), year)
const dataset = compactDataset(parsed)
const output = `src/data/enem${year}.json`
writeFileSync(output, `${JSON.stringify(dataset)}\n`)
console.log(`${output}: ${dataset.provas.length} cadernos, ${dataset.provas.reduce((sum, prova) => sum + prova.items.length, 0)} itens`)

// Habilidade da Matriz do ENEM de cada item (CO_ITEM → CO_HABILIDADE), usada
// no relatório da turma. Os códigos de item são únicos entre os anos.
const skillsFile = 'src/data/enemSkills.js'
const skills = existsSync(skillsFile) ? (await import(`../${skillsFile}?t=${Date.now()}`)).default : {}
parsed.provas.forEach((prova) => prova.items.forEach((item) => {
  const skill = Number(item.skill)
  if (item.item && Number.isFinite(skill) && skill > 0) skills[item.item] = skill
}))
writeFileSync(skillsFile, `// Gerado por scripts/build-enem-params.mjs: código do item do INEP → habilidade (H1 a H30).\nexport default ${JSON.stringify({ ...skills })}\n`)
console.log(`${skillsFile}: ${Object.keys(skills).length} itens com habilidade`)
