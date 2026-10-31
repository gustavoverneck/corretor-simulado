import { useRef, useState } from 'react'
import { FileUp, Sparkles } from 'lucide-react'
import { Badge, Button } from './ui'
import { getAnswerKeyVersions } from '../lib/assessment'
import { buildVersionTri, describeSegment, expandDataset, matchVersion, parseItensProva } from '../lib/enemTri'
import { triClassIds, triGroupMessage, triMode, TRI_MIN_SHEETS, updateTri } from '../lib/tri'

const BUNDLED_YEARS = [2025]

async function loadBundled(year) {
  const module = await import(`../data/enem${year}.json`)
  return expandDataset(module.default)
}

// Grava, para cada versão do simulado, os parâmetros oficiais do caderno do
// ENEM reconhecido pelo gabarito.
export function applyEnemDataset(assessment, dataset) {
  const versions = getAnswerKeyVersions(assessment).map((version) => {
    const tri = buildVersionTri(version.answerKey, dataset)
    return tri && { versionId: version.id, label: version.label, keySignature: JSON.stringify(version.answerKey), ...tri }
  }).filter(Boolean)
  return { versions, unmatched: getAnswerKeyVersions(assessment).filter((version) => !versions.some((item) => item.versionId === version.id)).map((version) => version.label) }
}

export function TriSettings({ assessment, classes, setData, notify, triStatus }) {
  const fileInput = useRef(null)
  const [busy, setBusy] = useState(false)
  const mode = triMode(assessment)
  const enem = assessment.tri?.enem
  const selectedClassIds = triClassIds(assessment)

  function save(changes) {
    setData((current) => ({ ...current, assessments: current.assessments.map((item) => item.id === assessment.id ? updateTri(item, changes) : item) }))
  }

  function toggleClass(classId, checked) {
    const next = checked ? [...new Set([...selectedClassIds, classId])] : selectedClassIds.filter((id) => id !== classId)
    if (!next.length) { notify('Escolha ao menos uma turma', 'A TRI precisa de pelo menos uma turma.', 'warning'); return }
    save({ classIds: next.length === assessment.classIds.length ? [] : next })
  }

  async function useDataset(load, source) {
    setBusy(true)
    try {
      const dataset = await load()
      const { versions, unmatched } = applyEnemDataset(assessment, dataset)
      if (!versions.length) throw new Error(`Nenhuma versão deste simulado bate com um caderno do ${source}. Confira se as questões e a ordem são as da prova oficial.`)
      save({ mode: 'enem', enem: { source: `ENEM ${dataset.year || ''}`.trim(), appliedAt: new Date().toISOString(), versions } })
      notify('Parâmetros do ENEM aplicados', `${versions.length} versão(ões) reconhecida(s)${unmatched.length ? `; sem correspondência: ${unmatched.join(', ')}` : ''}.`, unmatched.length ? 'warning' : 'success')
    } catch (error) {
      notify('Não foi possível usar os parâmetros', error.message, 'warning')
    } finally {
      setBusy(false)
    }
  }

  async function importFile(file) {
    if (!file) return
    const year = Number(file.name.match(/20\d{2}/)?.[0]) || null
    await useDataset(async () => parseItensProva(await file.text(), year), `arquivo ${file.name}`)
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <div className="tri-status">
      <div className="tri-mode">
        <label><input type="radio" name={`tri-mode-${assessment.id}`} checked={mode === 'estimated'} onChange={() => save({ mode: 'estimated' })} /><span><strong>Estimada com os alunos</strong><small>Para questões próprias. Precisa de {TRI_MIN_SHEETS}+ folhas por versão; escala do grupo (500 = média).</small></span></label>
        <label><input type="radio" name={`tri-mode-${assessment.id}`} checked={mode === 'enem'} onChange={() => save({ mode: 'enem' })} /><span><strong>Parâmetros oficiais do ENEM</strong><small>Para simulados com a prova do ENEM. Funciona com qualquer número de alunos; escala do ENEM.</small></span></label>
      </div>

      {mode === 'enem' && <div className="tri-enem">
        <div className="tri-enem-actions">
          {BUNDLED_YEARS.map((year) => <Button key={year} size="sm" icon={Sparkles} disabled={busy} onClick={() => useDataset(() => loadBundled(year), `ENEM ${year}`)}>Usar ENEM {year}</Button>)}
          <Button size="sm" variant="secondary" icon={FileUp} disabled={busy} onClick={() => fileInput.current?.click()}>Importar ITENS_PROVA de outro ano</Button>
          <input ref={fileInput} hidden type="file" accept=".csv,text/csv" onChange={(event) => importFile(event.target.files[0])} />
        </div>
        <p>O app compara o gabarito de cada versão com o gabarito oficial de cada caderno (cor, área e língua) e grava os parâmetros a, b e c das questões. Para outros anos, use o arquivo <code>DADOS/ITENS_PROVA_ano.csv</code> dos microdados do INEP.</p>
        {enem?.versions?.length ? <ul>{enem.versions.map((version) => <li key={version.versionId}><Badge tone="green">{enem.source}</Badge><span><strong>{version.label}</strong>: {version.segments.map((segment) => describeSegment({ prova: { area: segment.area, cor: segment.cor }, language: segment.language, rate: segment.rate })).join(' + ')}</span></li>)}</ul> : <p><strong>Nenhum caderno aplicado ainda.</strong></p>}
      </div>}

      {assessment.classIds.length > 1 && <div className="tri-classes"><span>Turmas com nota TRI</span>{assessment.classIds.map((classId) => <label key={classId}><input type="checkbox" checked={selectedClassIds.includes(classId)} onChange={(event) => toggleClass(classId, event.target.checked)} />{classes.find((item) => item.id === classId)?.name || 'Turma removida'}</label>)}</div>}

      {mode === 'estimated' && <p>Os parâmetros de cada questão são estimados com os alunos deste simulado, separados por área e por versão de gabarito. A escala é a do grupo: <strong>500 é a média de quem fez a prova</strong> e cada 100 pontos equivale a um desvio-padrão. Não é a escala oficial do INEP.</p>}
      {mode === 'enem' && <p>Nota por área na escala do ENEM, calculada como o INEP (modelo de 3 parâmetros, proficiência por EAP); a nota geral é a média das áreas. Pode haver pequenas diferenças para a nota oficial.</p>}
      {triStatus?.groups.length ? <ul>{triStatus.groups.map((group) => <li key={group.id}><Badge tone={group.status === 'ok' ? 'green' : 'ochre'}>{group.status === 'ok' ? 'Calculada' : 'Sem nota'}</Badge><span>{triGroupMessage(group) || `${group.label}: ${group.scored ?? group.sheets} folha(s), ${group.areas.filter((item) => item.status === 'ok').map((item) => item.area).join(', ')}.`}</span></li>)}</ul> : <p>Ainda não há folhas corrigidas nas turmas escolhidas.</p>}
    </div>
  )
}

export { matchVersion }
