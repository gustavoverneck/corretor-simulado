// Gera src/data/enem<ano>.json a partir do ITENS_PROVA dos microdados do INEP.
// Uso: node scripts/build-enem-params.mjs data/enem/2025/itens.csv 2025
import { readFileSync, writeFileSync } from 'node:fs'
import { compactDataset, parseItensProva } from '../src/lib/enemTri.js'

const [, , input, year] = process.argv
if (!input || !year) throw new Error('Uso: node scripts/build-enem-params.mjs <ITENS_PROVA.csv> <ano>')
const dataset = compactDataset(parseItensProva(readFileSync(input, 'utf8'), year))
const output = `src/data/enem${year}.json`
writeFileSync(output, `${JSON.stringify(dataset)}\n`)
console.log(`${output}: ${dataset.provas.length} cadernos, ${dataset.provas.reduce((sum, prova) => sum + prova.items.length, 0)} itens`)
