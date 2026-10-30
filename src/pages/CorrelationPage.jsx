import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Activity, BarChart3, BookOpenCheck, CircleHelp, Download, FileSpreadsheet, FileText, GitCompare, Grid3x3, Layers3, Lightbulb, ListChecks, Network, Settings2, UsersRound } from 'lucide-react'
import { Badge, Button, EmptyState } from '../components/ui'
import { downloadBlob, formatDate, initials } from '../lib/utils'
import { buildBipartiteNetwork, buildQuestionNetwork, buildStudentNetwork, buildTemporalAnalysis, questionCategory, summarizeBehavior } from '../lib/networkAnalysis'
import { answerKeyGroups, buildAreaReport, buildItemReport, buildTeacherInsights, correlationStrength, pairFor, reliabilityLabel, studentsNeedingAttention } from '../lib/teacherInsights'
import { buildCorrelationWorkbook } from '../lib/correlationReport'
import { CORRELATION_HELP, CORRELATION_HELP_ORDER } from '../lib/correlationHelp'

const colors = ['#47776a', '#b98558', '#796e91', '#56758d', '#a56565', '#748b5f']
const number = (value, digits = 3) => Number(value || 0).toFixed(digits).replace('.', ',')
const percent = (value, digits = 1) => `${(Number(value || 0) * 100).toFixed(digits).replace('.', ',')}%`
const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

function positionedNodes(nodes, bipartite = false) {
  if (bipartite) {
    const groups = { student: nodes.filter((node) => node.type === 'student'), question: nodes.filter((node) => node.type === 'question') }
    return nodes.map((node) => ({ ...node, x: node.type === 'student' ? 24 : 76, y: 7 + (groups[node.type].indexOf(node) + 1) * 86 / (groups[node.type].length + 1) }))
  }
  const communities = [...new Set(nodes.map((node) => node.community))]
  return nodes.map((node) => {
    const group = nodes.filter((item) => item.community === node.community); const groupIndex = communities.indexOf(node.community); const angle = Math.PI * 2 * groupIndex / Math.max(1, communities.length); const inner = Math.PI * 2 * group.indexOf(node) / Math.max(1, group.length)
    const radius = communities.length > 1 ? 27 : 0
    return { ...node, x: 50 + Math.cos(angle) * radius + Math.cos(inner) * Math.min(14, 4 + group.length), y: 50 + Math.sin(angle) * radius + Math.sin(inner) * Math.min(14, 4 + group.length) }
  })
}

function NetworkChart({ network, kind, maxEdges = 700 }) {
  const nodes = positionedNodes(network.nodes, kind === 'bipartite'); const byId = new Map(nodes.map((node) => [node.id, node])); const edges = [...network.edges].sort((a, b) => b.weight - a.weight).slice(0, maxEdges)
  return <div className={`research-network ${kind}`}><svg viewBox="0 0 100 100" role="img" aria-label={`Rede ${kind}`}><g>{edges.map((edge, index) => { const source = byId.get(edge.source); const target = byId.get(edge.target); return source && target ? <line key={`${edge.source}-${edge.target}-${index}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} opacity={kind === 'bipartite' ? .12 : .18 + edge.weight * .5} stroke={edge.correlation < 0 ? '#b9675f' : '#719589'} strokeWidth={kind === 'bipartite' ? .18 : .25 + edge.weight}><title>{source.label} ↔ {target.label}</title></line> : null })}</g><g>{nodes.map((node) => { const fill = kind === 'bipartite' ? node.type === 'student' ? '#52718a' : '#b98558' : colors[node.community % colors.length]; const radius = kind === 'bipartite' ? 1.35 : 1.8 + (node.centrality?.degree || 0) * 3; return <g key={node.id}><circle cx={node.x} cy={node.y} r={radius} fill={fill} stroke="white" strokeWidth=".45"><title>{node.label}{node.category ? ` · ${node.category}` : ''}</title></circle>{nodes.length <= 45 && <text x={node.x} y={node.y + .45} textAnchor="middle">{kind === 'student' ? initials(node.label) : node.label}</text>}</g> })}</g></svg>{network.edges.length > maxEdges && <small>Exibindo as {maxEdges} ligações de maior peso.</small>}</div>
}

function Metrics({ students, questions }) {
  const ranking = [...students.nodes].sort((a, b) => b.centrality.degree - a.centrality.degree)
  return <><div className="research-metrics"><div><span>Densidade dos alunos</span><strong>{number(students.density)}</strong><small>ligações observadas / possíveis</small></div><div><span>Modularidade</span><strong>{number(students.modularity)}</strong><small>separação das comunidades</small></div><div><span>Comunidades</span><strong>{students.communityCount}</strong><small>propagação de rótulos</small></div><div><span>Densidade dos itens</span><strong>{number(questions.density)}</strong><small>relações acima do limiar</small></div></div><div className="table-wrap"><table className="research-table"><thead><tr><th>ALUNO</th><th>GRUPO</th><th>GRAU</th><th>INTERMEDIAÇÃO</th><th>PROXIMIDADE</th><th>AUTOVETOR</th></tr></thead><tbody>{ranking.slice(0, 12).map((node) => <tr key={node.id}><td><strong>{node.label}</strong></td><td>Comunidade {node.community + 1}</td><td>{number(node.centrality.degree)}</td><td>{number(node.centrality.betweenness)}</td><td>{number(node.centrality.closeness)}</td><td>{number(node.centrality.eigenvector)}</td></tr>)}</tbody></table></div></>
}

function Timeline({ rows }) {
  if (rows.length < 2) return <div className="research-empty"><Activity size={25} /><div><strong>Série temporal insuficiente</strong><p>São necessários ao menos dois simulados corrigidos para a turma selecionada.</p></div></div>
  return <div className="timeline-list">{rows.map((row, index) => <div key={row.assessmentId}><span>{formatDate(row.date)}</span><strong>{row.title}</strong><small>{row.students} alunos · média {row.meanScore.toFixed(1)}% · densidade {number(row.density)} · modularidade {number(row.modularity)} · {row.communities} comunidades</small>{index > 0 && <b className={row.meanScore >= rows[index - 1].meanScore ? 'up' : 'down'}>{row.meanScore >= rows[index - 1].meanScore ? '+' : ''}{(row.meanScore - rows[index - 1].meanScore).toFixed(1).replace('.', ',')} p.p.</b>}</div>)}</div>
}

const whole = (value) => value === null || value === undefined || !Number.isFinite(value) ? '—' : `${Math.round(value)}%`
const signed = (value, digits = 2) => value === null || value === undefined ? '—' : number(value, digits)

function discriminationLabel(value) {
  if (value === null || value === undefined) return ['neutral', '—']
  if (value < 0) return ['red', 'Negativa']
  if (value < 0.2) return ['ochre', 'Fraca']
  if (value < 0.3) return ['neutral', 'Regular']
  if (value < 0.4) return ['green', 'Boa']
  return ['green', 'Excelente']
}

function correlationColor(r) {
  if (r === null || r === undefined) return { background: '#f4f6f5', color: '#9aa29f' }
  const alpha = Math.min(1, Math.abs(r)) * .8
  return { background: r >= 0 ? `rgba(66, 111, 98, ${alpha})` : `rgba(173, 91, 86, ${alpha})`, color: alpha > .45 ? '#fff' : '#34453e' }
}

function scoreClass(value) {
  if (!Number.isFinite(value)) return 'empty'
  return value < 40 ? 'low' : value < 60 ? 'mid' : value < 80 ? 'good' : 'high'
}

function HelpContent({ help }) {
  return <><strong>{help.title}</strong><p>{help.text}</p>{help.ranges && <ul>{help.ranges.map(([tone, range, meaning]) => <li key={range}><Badge tone={tone}>{range}</Badge><span>{meaning}</span></li>)}</ul>}{help.note && <small>{help.note}</small>}</>
}

// Ícone "?" que abre a explicação; fica num portal para não ser cortado pelas tabelas com rolagem.
function HelpTip({ id }) {
  const help = CORRELATION_HELP[id]; const button = useRef(null); const [position, setPosition] = useState(null)
  useEffect(() => {
    if (!position) return undefined
    const close = (event) => { if (event.type === 'keydown' ? event.key === 'Escape' : !button.current?.contains(event.target) && !event.target.closest?.('.help-popover')) setPosition(null) }
    const hide = () => setPosition(null)
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close); window.addEventListener('scroll', hide, true); window.addEventListener('resize', hide)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide) }
  }, [position])
  function toggle(event) {
    event.stopPropagation()
    if (position) return setPosition(null)
    const rect = button.current.getBoundingClientRect(); const width = Math.min(320, window.innerWidth - 24)
    setPosition({ width, left: Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12)), top: rect.bottom + 8, bottom: window.innerHeight - rect.top + 8, above: rect.bottom > window.innerHeight * .6 })
  }
  if (!help) return null
  return <><button ref={button} type="button" className={`help-tip${position ? ' open' : ''}`} aria-label={`O que é ${help.title}?`} aria-expanded={Boolean(position)} onClick={toggle}><CircleHelp size={13} /></button>
    {position && createPortal(<div className="help-popover" role="dialog" aria-label={help.title} style={{ left: position.left, width: position.width, ...(position.above ? { bottom: position.bottom } : { top: position.top }) }}><HelpContent help={help} /></div>, document.body)}</>
}

function HelpGlossary() {
  return <details className="panel help-glossary"><summary><CircleHelp size={16} /><div><strong>Como ler os números desta aba</strong><span>O que cada métrica significa e quais faixas o sistema usa.</span></div></summary><div className="help-glossary-grid">{CORRELATION_HELP_ORDER.map((id) => <section key={id}><HelpContent help={CORRELATION_HELP[id]} /></section>)}</div></details>
}

function Overview({ itemReport, areaReport, insights, attention }) {
  const reliability = reliabilityLabel(itemReport?.alpha)
  const reteach = (itemReport?.items || []).filter((item) => !item.cancelled && item.flag !== 'key').sort((a, b) => a.correctRate - b.correctRate).slice(0, 6)
  return <>
    <section className="panel"><div className="research-metrics">
      <div><span>Média da prova <HelpTip id="mean" /></span><strong>{whole(areaReport.summary.mean)}</strong><small>{areaReport.summary.n} folhas · desvio {Math.round(areaReport.summary.sd || 0)} p.p.</small></div>
      <div><span>Confiabilidade <HelpTip id="alpha" /></span><strong>{itemReport?.alpha === null || itemReport?.alpha === undefined ? '—' : number(itemReport.alpha, 2)}</strong><small><Badge tone={reliability.tone}>{reliability.label}</Badge></small></div>
      <div><span>Questões para revisar <HelpTip id="review" /></span><strong>{itemReport?.review.length ?? 0}</strong><small>gabarito, enunciado ou discriminação</small></div>
      <div><span>Alunos em atenção <HelpTip id="attention" /></span><strong>{attention.length}</strong><small>nota baixa ou muitos brancos</small></div>
    </div></section>
    <section className="panel"><header className="panel-header"><div><h3>O que os dados mostram</h3><p>Leitura automática do simulado, da mais para a menos importante.</p></div><Lightbulb size={18} color="#a87345" /></header>
      {insights.length ? <ul className="insight-list">{insights.map((insight) => <li key={insight.title} className={`insight-${insight.tone}`}><strong>{insight.title}</strong><p>{insight.text}</p></li>)}</ul> : <div className="research-empty"><div><strong>Sem dados suficientes</strong><p>Corrija mais folhas para gerar a leitura.</p></div></div>}
    </section>
    <div className="insight-columns">
      <section className="panel"><header className="panel-header"><div><h3>Questões para retomar em sala</h3><p>Menor taxa de acerto, com a alternativa errada mais marcada.</p></div></header>
        <div className="table-wrap"><table className="insight-table"><thead><tr><th>QUESTÃO</th><th>ÁREA</th><th>ACERTO <HelpTip id="correctRate" /></th><th>ERRO MAIS COMUM <HelpTip id="options" /></th></tr></thead><tbody>{reteach.map((item) => <tr key={item.index}><td><strong>Q{item.number}</strong></td><td>{item.area}</td><td><span className={`score-pill ${scoreClass(item.correctRate * 100)}`}>{percent(item.correctRate, 0)}</span></td><td>{item.topDistractor ? `${item.topDistractor.letter} (${percent(item.topDistractor.share, 0)}) · gabarito ${item.key}` : '—'}</td></tr>)}</tbody></table></div>
      </section>
      <section className="panel"><header className="panel-header"><div><h3>Alunos que precisam de atenção</h3><p>Nota abaixo de 40% ou 25% ou mais em branco.</p></div><Badge tone={attention.length ? 'ochre' : 'green'}>{attention.length}</Badge></header>
        {attention.length ? <div className="table-wrap"><table className="insight-table"><thead><tr><th>ALUNO</th><th>NOTA</th><th>ÁREA MAIS FRACA</th><th>MOTIVO</th></tr></thead><tbody>{attention.slice(0, 15).map((row) => <tr key={row.submissionId}><td><strong>{row.name}</strong><small>{row.className}</small></td><td><span className={`score-pill ${scoreClass(row.score)}`}>{row.score}%</span></td><td>{row.weakest ? `${row.weakest.area} (${whole(row.weakest.score)})` : '—'}</td><td>{row.reasons.join('; ')}</td></tr>)}</tbody></table>{attention.length > 15 && <p className="method-note">Mais {attention.length - 15} aluno(s) na planilha exportada.</p>}</div> : <div className="research-empty"><div><strong>Nenhum aluno em alerta</strong><p>Todos tiveram nota de 40% ou mais e responderam a maior parte da prova.</p></div></div>}
      </section>
    </div>
  </>
}

function ItemsView({ itemReport, groupNote }) {
  const [area, setArea] = useState('all'); const [filter, setFilter] = useState('all'); const [sort, setSort] = useState('number')
  if (!itemReport) return null
  const areas = [...new Set(itemReport.items.map((item) => item.area))]
  const letters = Object.keys(itemReport.items[0]?.distribution || {})
  const items = itemReport.items.filter((item) => (area === 'all' || item.area === area) && (filter === 'all' || (filter === 'alerts' ? !['green', 'neutral'].includes(item.diagnosis.tone) : item.diagnosis.tone === 'green')))
    .sort((a, b) => sort === 'easy' ? a.correctRate - b.correctRate : sort === 'discrimination' ? (a.discrimination ?? 9) - (b.discrimination ?? 9) : a.number - b.number)
  return <section className="panel"><header className="panel-header"><div><h3>Análise das questões <HelpTip id="discrimination" /></h3><p>Acerto, discriminação e alternativas marcadas em cada questão.</p></div><Badge tone="blue">{itemReport.sheets} folhas</Badge></header>
    {groupNote && <p className="method-note">{groupNote}</p>}
    <div className="item-controls"><label><span>Área</span><select value={area} onChange={(event) => setArea(event.target.value)}><option value="all">Todas</option>{areas.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Mostrar</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Todas as questões</option><option value="alerts">Só com alerta</option><option value="good">Só boas questões</option></select></label><label><span>Ordenar por</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="number">Número</option><option value="easy">Menor acerto</option><option value="discrimination">Menor discriminação</option></select></label></div>
    <div className="table-wrap"><table className="item-table"><thead><tr><th>Q</th><th>ÁREA</th><th>GAB.</th><th>ACERTO <HelpTip id="correctRate" /></th><th>DISCRIMINAÇÃO <HelpTip id="discrimination" /></th><th>ALTERNATIVAS MARCADAS <HelpTip id="options" /></th><th>DIAGNÓSTICO <HelpTip id="diagnosis" /></th></tr></thead><tbody>{items.map((item) => { const [tone, label] = discriminationLabel(item.discrimination); return <tr key={item.index}>
      <td><strong>Q{item.number}</strong></td><td>{item.area}</td><td className="mono-cell">{item.cancelled ? '—' : item.key}</td>
      <td>{item.cancelled ? '—' : <span className={`score-pill ${scoreClass(item.correctRate * 100)}`}>{percent(item.correctRate, 0)}</span>}</td>
      <td>{item.cancelled ? '—' : <div className="discrimination-cell"><strong>{signed(item.discrimination)}</strong><Badge tone={tone}>{label}</Badge></div>}</td>
      <td><div className="option-chips">{letters.map((letter) => <span key={letter} className={letter === item.key ? 'key' : item.topDistractor?.letter === letter && item.topDistractor.share >= .25 ? 'distractor' : ''} style={{ '--share': item.distribution[letter] }}><b>{letter}</b>{percent(item.distribution[letter], 0)}</span>)}<span className="blank"><b>Br</b>{percent(item.blankRate, 0)}</span></div></td>
      <td><div className="diagnosis-cell"><Badge tone={item.diagnosis.tone}>{item.diagnosis.label}</Badge>{item.diagnosis.hint && <small>{item.diagnosis.hint}</small>}</div></td>
    </tr> })}</tbody></table></div>
    <p className="method-note"><strong>Acerto</strong>: parte dos alunos que acertou. <strong>Discriminação</strong>: correlação entre acertar a questão e a nota no restante da prova (0,3 ou mais é boa; abaixo de 0,2 a questão quase não separa quem domina o conteúdo; negativa sugere problema no enunciado ou no gabarito). Em verde, o gabarito; em roxo, a alternativa errada que mais atraiu. {itemReport.small && 'Com menos de 15 folhas, discriminação e gabarito suspeito não entram no diagnóstico.'}</p>
  </section>
}

function AreasView({ areaReport, itemReport, itemLabel }) {
  const names = areaReport.areas.map((area) => area.area)
  if (names.length < 2) return <section className="panel"><div className="research-empty"><Grid3x3 size={25} /><div><strong>Uma única área neste simulado</strong><p>Cadastre as áreas das questões no simulado para comparar o desempenho entre elas.</p></div></div></section>
  return <>
    <section className="panel"><header className="panel-header"><div><h3>Correlação entre áreas <HelpTip id="areaCorrelation" /></h3><p>Quanto as notas de duas áreas andam juntas entre os alunos.</p></div><Badge tone="neutral">{areaReport.summary.n} alunos</Badge></header>
      <div className="table-wrap"><table className="corr-matrix"><thead><tr><th />{names.map((name) => <th key={name} title={name}>{name}</th>)}</tr></thead><tbody>{names.map((first) => <tr key={first}><th>{first}</th>{names.map((second) => { if (first === second) return <td key={second} className="diagonal">—</td>; const pair = pairFor(areaReport.pairs, first, second); return <td key={second} style={correlationColor(pair?.r)} title={pair?.r === null || !pair ? 'Dados insuficientes' : `r = ${number(pair.r, 2)} · ${correlationStrength(pair.r)} · n = ${pair.n} · p ${pair.p < .001 ? '< 0,001' : `= ${number(pair.p, 3)}`}`}><strong>{pair?.r === null || !pair ? '—' : number(pair.r, 2)}</strong>{pair?.r !== null && pair && <small>{correlationStrength(pair.r)}{pair.significant ? '' : ' · incerta'}</small>}</td> })}</tr>)}</tbody></table></div>
      <p className="method-note">Perto de 1: quem vai bem numa área tende a ir bem na outra, então reforçar uma pode ajudar a outra. Perto de 0: são dificuldades independentes e pedem trabalho separado. "Incerta" indica que, com esse número de alunos, a relação pode ser acaso.</p>
    </section>
    <section className="panel"><header className="panel-header"><div><h3>Média e consistência por área</h3><p>O alfa mostra se as questões da área medem a mesma habilidade{itemLabel ? ` (${itemLabel})` : ''}.</p></div></header>
      <div className="table-wrap"><table className="insight-table"><thead><tr><th>ÁREA</th><th>MÉDIA</th><th>DESVIO <HelpTip id="deviation" /></th><th>ALFA DA ÁREA <HelpTip id="areaAlpha" /></th></tr></thead><tbody>{areaReport.areas.map((area) => { const alpha = itemReport?.areaAlpha?.[area.area]; const label = reliabilityLabel(alpha); return <tr key={area.area}><td><strong>{area.area}</strong></td><td><span className={`score-pill ${scoreClass(area.mean)}`}>{whole(area.mean)}</span></td><td>{Math.round(area.sd || 0)} p.p.</td><td>{alpha === null || alpha === undefined ? '—' : <div className="discrimination-cell"><strong>{number(alpha, 2)}</strong><Badge tone={label.tone}>{label.label}</Badge></div>}</td></tr> })}</tbody></table></div>
    </section>
    {areaReport.byClass.length > 1 && <section className="panel"><header className="panel-header"><div><h3>Média por turma e área <HelpTip id="classAreas" /></h3><p>Onde cada turma está mais forte ou mais fraca.</p></div></header>
      <div className="table-wrap"><table className="corr-matrix class-matrix"><thead><tr><th>TURMA</th><th>GERAL</th>{names.map((name) => <th key={name}>{name}</th>)}</tr></thead><tbody>{areaReport.byClass.map((row) => <tr key={row.classId}><th>{row.name}<small>{row.n} alunos</small></th><td className={`heat ${scoreClass(row.mean)}`}><strong>{whole(row.mean)}</strong></td>{names.map((name) => <td key={name} className={`heat ${scoreClass(row.areas[name])}`}><strong>{whole(row.areas[name])}</strong></td>)}</tr>)}</tbody></table></div>
    </section>}
  </>
}

export function CorrelationPage({ data, notify }) {
  const assessments = data.assessments.filter((item) => data.submissions.some((row) => row.assessmentId === item.id && Array.isArray(row.answers)))
  const [assessmentId, setAssessmentId] = useState(assessments[0]?.id || ''); const [classId, setClassId] = useState('all'); const [versionId, setVersionId] = useState('all'); const [dimension, setDimension] = useState('area'); const [category, setCategory] = useState('all'); const [threshold, setThreshold] = useState(.65); const [confidence, setConfidence] = useState(.95); const [view, setView] = useState('overview'); const [advanced, setAdvanced] = useState(false)
  const assessment = assessments.find((item) => item.id === assessmentId) || assessments[0]
  const classSubmissions = useMemo(() => data.submissions.filter((row) => row.assessmentId === assessment?.id && Array.isArray(row.answers) && (classId === 'all' || row.classId === classId)), [data.submissions, assessment?.id, classId])
  const groups = useMemo(() => assessment ? answerKeyGroups(assessment, classSubmissions) : [], [assessment, classSubmissions])
  const group = groups.find((item) => item.id === versionId) || groups[0]
  const scopeSubmissions = versionId === 'all' ? classSubmissions : group?.submissions || []
  const itemReport = useMemo(() => group && buildItemReport({ assessment: group.assessment, answerKey: group.answerKey, submissions: group.submissions, optionCount: assessment.optionCount || 5 }), [group, assessment?.optionCount])
  const areaReport = useMemo(() => buildAreaReport({ assessment, submissions: scopeSubmissions, students: data.students, classes: data.classes }), [assessment, scopeSubmissions, data.students, data.classes])
  const attention = useMemo(() => studentsNeedingAttention(areaReport), [areaReport])
  const itemLabel = groups.length > 1 && group ? group.label : ''
  const insights = useMemo(() => buildTeacherInsights({ itemReport, areaReport, attention, versionLabel: itemLabel }), [itemReport, areaReport, attention, itemLabel])
  // As redes comparam questões pela posição, então usam só folhas da mesma versão.
  const networkAssessment = group?.assessment || assessment; const networkSubmissions = group?.submissions || []
  const categories = useMemo(() => networkAssessment ? [...new Set(Array.from({ length: networkAssessment.questionCount }, (_, index) => questionCategory(networkAssessment, index, dimension)))] : [], [networkAssessment, dimension])
  const studentNetwork = useMemo(() => advanced && networkAssessment && buildStudentNetwork({ assessment: networkAssessment, submissions: networkSubmissions, students: data.students, dimension, category, threshold }), [advanced, networkAssessment, networkSubmissions, data.students, dimension, category, threshold])
  const questionNetwork = useMemo(() => advanced && networkAssessment && buildQuestionNetwork({ assessment: networkAssessment, submissions: networkSubmissions, dimension, category, confidence }), [advanced, networkAssessment, networkSubmissions, dimension, category, confidence])
  const bipartite = useMemo(() => advanced && networkAssessment && buildBipartiteNetwork({ assessment: networkAssessment, submissions: networkSubmissions, students: data.students, dimension, category }), [advanced, networkAssessment, networkSubmissions, data.students, dimension, category])
  const timeline = useMemo(() => advanced ? buildTemporalAnalysis({ assessments, submissions: data.submissions, students: data.students, classId, threshold }) : [], [advanced, assessments, data.submissions, data.students, classId, threshold])
  const behavior = useMemo(() => summarizeBehavior(networkSubmissions), [networkSubmissions])
  if (!assessment) return <EmptyState icon={GitCompare} title="Ainda não há dados para correlacionar" description="Corrija folhas em pelo menos um simulado para ver a análise das questões e das áreas." />
  const classes = assessment.classIds?.map((id) => data.classes.find((item) => item.id === id)).filter(Boolean) || []
  const className = classId === 'all' ? 'todas as turmas' : classes.find((item) => item.id === classId)?.name || 'turma'
  const scopeLabel = `${className} · ${versionId === 'all' ? (groups.length > 1 ? 'todas as versões' : 'gabarito único') : group?.label}`
  const groupNote = groups.length > 1 && versionId === 'all' ? `As versões deste simulado têm gabaritos diferentes, então as questões são analisadas por versão. Mostrando ${group.label} (${group.submissions.length} folhas); escolha outra no filtro Versão.` : ''

  function exportWorkbook() {
    const { bytes } = buildCorrelationWorkbook({ assessment, scopeLabel, itemReport, itemLabel, areaReport, insights, attention })
    downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `analise-${assessment.code || assessment.id}.xlsx`)
    notify?.('Planilha exportada', 'Resumo, questões, áreas e alunos em atenção.')
  }
  function exportCsv() { const rows = [['tipo', 'origem', 'destino', 'peso', 'correlacao', 'p_valor', 'ic_inferior', 'ic_superior', 'n'], ...studentNetwork.edges.map((edge) => ['aluno-aluno', edge.source, edge.target, edge.weight, '', '', '', '', edge.observations]), ...questionNetwork.edges.map((edge) => ['questao-questao', edge.source, edge.target, edge.weight, edge.correlation, edge.p, edge.ci[0], edge.ci[1], edge.n])]; downloadBlob(new Blob([`﻿${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`], { type: 'text/csv;charset=utf-8' }), `rede-${assessment.code || assessment.id}.csv`); notify?.('Dados e métricas exportados em CSV.') }
  function exportReport() { const significant = questionNetwork.edges.filter((edge) => edge.significant); const report = { generatedAt: new Date().toISOString(), assessment: { id: assessment.id, title: assessment.title, date: assessment.date }, filters: { classId, versionId: group?.id, dimension, category, threshold, confidence }, sample: { students: studentNetwork.nodes.length, sheets: behavior.sheets }, metrics: { student: { density: studentNetwork.density, modularity: studentNetwork.modularity, communities: studentNetwork.communityCount }, question: { density: questionNetwork.density, modularity: questionNetwork.modularity, communities: questionNetwork.communityCount, significant: significant.length }, behavior, timeline }, nodes: { students: studentNetwork.nodes.map(({ submission, ...node }) => node), questions: questionNetwork.nodes }, edges: { students: studentNetwork.edges, questions: questionNetwork.edges }, insights, method: 'Similaridade por concordância; comunidades por propagação de rótulos; centralidades normalizadas; correlação phi/Pearson, p bilateral aproximado e IC por z de Fisher. Análise exploratória, sem inferência causal.' }; downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `relatorio-${assessment.code || assessment.id}.json`); notify?.('Relatório completo exportado em JSON.') }

  const tabs = [['overview', Lightbulb, 'Visão geral'], ['items', ListChecks, 'Questões'], ['areas', Grid3x3, 'Áreas'], ...(advanced ? [['research', BarChart3, 'Métricas de rede'], ['students', UsersRound, 'Aluno–aluno'], ['bipartite', Network, 'Aluno–questão'], ['questions', BookOpenCheck, 'Questão–questão'], ['layers', Layers3, 'Multicamada'], ['temporal', Activity, 'Temporal']] : [])]
  const activeView = tabs.some(([id]) => id === view) ? view : 'overview'
  const significant = advanced ? questionNetwork.edges.filter((edge) => edge.significant) : []
  return <div className="page-stack research-page"><section className="correlation-intro"><span><Network size={21} /></span><div><strong>Leitura pedagógica do simulado</strong><p>Quais questões funcionaram, quais conteúdos retomar, como as áreas se relacionam e quais alunos precisam de atenção.</p></div><Badge tone="blue">{areaReport.summary.n} folhas</Badge></section>
    <section className={`panel research-toolbar${advanced ? ' advanced' : ''}`}><div className="research-filter-grid"><label><span>Simulado</span><select value={assessment.id} onChange={(event) => { setAssessmentId(event.target.value); setClassId('all'); setVersionId('all'); setCategory('all') }}>{assessments.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label><span>Turma</span><select value={classId} onChange={(event) => { setClassId(event.target.value); setVersionId('all') }}><option value="all">Todas</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{groups.length > 1 && <label><span>Versão</span><select value={versionId} onChange={(event) => { setVersionId(event.target.value); setCategory('all') }}><option value="all">Todas as versões</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.label} ({item.submissions.length})</option>)}</select></label>}
      {advanced && <><label><span>Comparar por</span><select value={dimension} onChange={(event) => { setDimension(event.target.value); setCategory('all') }}><option value="area">Área</option><option value="skill">Habilidade</option><option value="descriptor">Descritor</option><option value="content">Conteúdo</option></select></label><label><span>Recorte</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Todos</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Similaridade {percent(threshold, 0)}</span><input type="range" min=".4" max=".95" step=".05" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label><label><span>Confiança</span><select value={confidence} onChange={(event) => setConfidence(Number(event.target.value))}><option value=".9">90%</option><option value=".95">95%</option><option value=".99">99%</option></select></label></>}</div>
      <div className="research-actions"><Button variant="secondary" onClick={() => setAdvanced(!advanced)}><Settings2 size={15} />{advanced ? 'Ocultar avançado' : 'Avançado'}</Button>{advanced && <><Button variant="secondary" onClick={exportCsv}><Download size={15} />CSV</Button><Button variant="secondary" onClick={exportReport}><FileText size={15} />JSON</Button></>}<Button onClick={exportWorkbook}><FileSpreadsheet size={15} />Exportar planilha</Button></div></section>
    <nav className="research-tabs">{tabs.map(([id, Icon, label]) => <button key={id} className={activeView === id ? 'active' : ''} onClick={() => setView(id)}><Icon size={15} />{label}</button>)}</nav>
    {activeView === 'overview' && <Overview itemReport={itemReport} areaReport={areaReport} insights={insights} attention={attention} />}
    {activeView === 'items' && <ItemsView itemReport={itemReport} groupNote={groupNote} />}
    {activeView === 'areas' && <AreasView areaReport={areaReport} itemReport={itemReport} itemLabel={itemLabel} />}
    {['overview', 'items', 'areas'].includes(activeView) && <HelpGlossary />}
    {advanced && groups.length > 1 && !['overview', 'items', 'areas'].includes(activeView) && <p className="method-note">As redes usam só as folhas de {group.label}, porque cada versão tem questões em outra ordem.</p>}
    {activeView === 'research' && <section className="panel"><header className="panel-header"><div><h3>Métricas estruturais e centralidade</h3><p>Indicadores normalizados para comparação entre recortes.</p></div><Badge tone="neutral">n = {studentNetwork.nodes.length}</Badge></header><Metrics students={studentNetwork} questions={questionNetwork} /><p className="method-note">{significant.length} de {questionNetwork.edges.length} associações entre questões são significativas com confiança de {(confidence * 100).toFixed(0)}%. Resultados associativos, não causais.</p></section>}
    {activeView === 'students' && <section className="panel"><header className="panel-header"><div><h3>Comunidades de alunos</h3><p>Cores representam comunidades; tamanho reflete centralidade de grau.</p></div><Badge tone="blue">{studentNetwork.communityCount} comunidades</Badge></header><NetworkChart network={studentNetwork} kind="student" /></section>}
    {activeView === 'bipartite' && <section className="panel"><header className="panel-header"><div><h3>Rede aluno–questão</h3><p>Azul: alunos; ocre: questões; arestas: marcações observadas.</p></div><Badge tone="neutral">Densidade {number(bipartite.density)}</Badge></header><NetworkChart network={bipartite} kind="bipartite" /></section>}
    {activeView === 'questions' && <section className="panel"><header className="panel-header"><div><h3>Rede questão–questão</h3><p>Correlação phi, significância bilateral e intervalo de confiança por z de Fisher.</p></div><Badge tone="blue">{significant.length} significativas</Badge></header><NetworkChart network={questionNetwork} kind="question" /><div className="table-wrap"><table className="research-table"><thead><tr><th>PAR</th><th>φ</th><th>IC</th><th>p</th><th>n</th><th>RESULTADO</th></tr></thead><tbody>{questionNetwork.edges.slice().sort((a, b) => a.p - b.p).slice(0, 20).map((edge) => <tr key={`${edge.source}-${edge.target}`}><td>{edge.source.toUpperCase()} × {edge.target.toUpperCase()}</td><td>{number(edge.correlation)}</td><td>[{number(edge.ci[0])}; {number(edge.ci[1])}]</td><td>{edge.p < .001 ? '< 0,001' : number(edge.p)}</td><td>{edge.n}</td><td><Badge tone={edge.significant ? 'green' : 'neutral'}>{edge.significant ? 'Significativa' : 'Não significativa'}</Badge></td></tr>)}</tbody></table></div></section>}
    {activeView === 'layers' && <section className="panel"><header className="panel-header"><div><h3>Rede multicamada integrada</h3><p>Integra camadas social-cognitiva, de itens e de participação.</p></div><Badge tone="blue">3 camadas</Badge></header><div className="multilayer-grid">{[[studentNetwork, 'student', 'Aluno–aluno'], [questionNetwork, 'question', 'Questão–questão'], [bipartite, 'bipartite', 'Aluno–questão']].map(([network, kind, label]) => <div key={kind}><NetworkChart network={network} kind={kind} maxEdges={300} /><strong>{label}</strong><small>{network.nodes.length} nós · {network.edges.length} arestas</small></div>)}</div></section>}
    {activeView === 'temporal' && <><section className="panel"><header className="panel-header"><div><h3>Mudanças após intervenções</h3><p>Série longitudinal por aplicação; não atribui causalidade sem desenho pré/pós.</p></div><Badge tone="neutral">{timeline.length} momentos</Badge></header><Timeline rows={timeline} /></section><section className="panel"><header className="panel-header"><div><h3>Comportamento real em sala</h3><p>Indicadores observados nas folhas e na leitura óptica.</p></div></header><div className="research-metrics"><div><span>Folhas</span><strong>{behavior.sheets}</strong><small>registros processados</small></div><div><span>Em branco</span><strong>{percent(behavior.blankRate)}</strong><small>{behavior.totalAnswers} respostas</small></div><div><span>Múltiplas</span><strong>{percent(behavior.multipleRate)}</strong><small>dúvida ou rasura</small></div><div><span>Confiança OMR</span><strong>{behavior.meanConfidence === null ? '—' : `${behavior.meanConfidence.toFixed(1)}%`}</strong><small>{percent(behavior.reviewRate)} para revisão</small></div></div><p className="method-note">Posição em sala e interação oral não são inferidas. Para publicação, combine com diário de campo, mapa de sala e protocolo de intervenção.</p></section></>}
  </div>
}
