import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { bubbleCenter, MARKERS, SHEET } from '../lib/omr'
import { qrPayload } from '../lib/utils'

const options = ['A', 'B', 'C', 'D', 'E']
const governmentLogo = `${import.meta.env.BASE_URL}assets/brasao-governo-es-horizontal.png`

export function AnswerSheet({ student, assessment, classroom, school }) {
  const [qr, setQr] = useState('')
  const payload = useMemo(() => qrPayload(student.id, assessment.id), [student.id, assessment.id])
  const schoolLocation = [school.address, school.city && school.state ? `${school.city} – ${school.state}.` : school.city || school.state]
    .filter(Boolean)
    .join(', ')

  useEffect(() => {
    QRCode.toDataURL(payload, { margin: 1, width: 220, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } })
      .then(setQr)
  }, [payload])

  return (
    <svg className="answer-sheet" viewBox={`0 0 ${SHEET.width} ${SHEET.height}`} role="img" aria-label={`Folha de respostas de ${student.name}`}>
      <rect width={SHEET.width} height={SHEET.height} fill="white" />
      {Object.values(MARKERS).map((marker, index) => (
        <g key={index}>
          <rect x={marker.x - 15} y={marker.y - 15} width="30" height="30" rx="2" fill="#111" />
          <rect x={marker.x - 7} y={marker.y - 7} width="14" height="14" fill="white" />
          <rect x={marker.x - 3} y={marker.y - 3} width="6" height="6" fill="#111" />
        </g>
      ))}

      <image href={governmentLogo} x="72" y="18" width="184" height="73" preserveAspectRatio="xMidYMid meet" />
      <line x1="274" y1="18" x2="274" y2="102" stroke="#d8dedb" />
      <g fontFamily="Arial, sans-serif" textAnchor="start">
        <text x="294" y="31" fontSize="8.5" fontWeight="700" fill="#527468" letterSpacing="1">SECRETARIA DE ESTADO DA EDUCAÇÃO</text>
        <text x="294" y="56" fontSize="17" fontWeight="700" fill="#17221e">{school.name}</text>
        <text x="294" y="76" fontSize="10" fill="#4f5b56">{schoolLocation}</text>
        {school.postalCode && <text x="294" y="94" fontSize="9.5" fill="#6f7975">CEP {school.postalCode}</text>}
      </g>
      <rect x="65" y="113" width="643" height="27" rx="6" fill="#edf2ef" />
      <circle cx="81" cy="126.5" r="3.5" fill="#527468" />
      <text x="94" y="130" fontFamily="Arial, sans-serif" fontSize="9" fontWeight="700" fill="#48685e" letterSpacing=".9">SISTEMA DE AVALIAÇÕES</text>
      <text x="692" y="130" textAnchor="end" fontFamily="Arial, sans-serif" fontSize="9" fontWeight="700" fill="#48685e" letterSpacing=".9">FOLHA DE RESPOSTAS</text>

      {qr && <image href={qr} x="65" y="148" width="122" height="122" />}
      <rect x="65" y="148" width="122" height="122" fill="none" stroke="#202a26" strokeWidth="1" />
      <text x="126" y="284" textAnchor="middle" fontFamily="Arial" fontSize="8" fill="#5e6864">IDENTIFICAÇÃO DIGITAL</text>

      <text x="216" y="162" fontFamily="Arial" fontSize="9" fontWeight="700" fill="#6a736f">ALUNO(A)</text>
      <text x="216" y="184" fontFamily="Arial" fontSize="17" fontWeight="700" fill="#17221e">{student.name.toUpperCase()}</text>
      <line x1="216" y1="195" x2="708" y2="195" stroke="#bfc8c4" />
      <text x="216" y="217" fontFamily="Arial" fontSize="9" fontWeight="700" fill="#6a736f">MATRÍCULA</text>
      <text x="216" y="237" fontFamily="Arial" fontSize="13" fill="#17221e">{student.registration}</text>
      <text x="407" y="217" fontFamily="Arial" fontSize="9" fontWeight="700" fill="#6a736f">TURMA</text>
      <text x="407" y="237" fontFamily="Arial" fontSize="13" fill="#17221e">{classroom?.name || '—'} · {classroom?.shift || ''}</text>
      <text x="566" y="217" fontFamily="Arial" fontSize="9" fontWeight="700" fill="#6a736f">DATA</text>
      <text x="566" y="237" fontFamily="Arial" fontSize="13" fill="#17221e">____ / ____ / ______</text>
      <text x="216" y="266" fontFamily="Arial" fontSize="9" fontWeight="700" fill="#6a736f">SIMULADO</text>
      <text x="216" y="286" fontFamily="Arial" fontSize="13" fontWeight="700" fill="#17221e">{assessment.title}</text>
      <text x="566" y="266" fontFamily="Arial" fontSize="9" fontWeight="700" fill="#6a736f">CÓDIGO</text>
      <text x="566" y="286" fontFamily="Arial" fontSize="13" fill="#17221e">{assessment.code} · {classroom?.name}</text>

      <rect x="65" y="311" width="643" height="52" rx="7" fill="#f1f4f2" />
      <circle cx="86" cy="329" r="6" fill="none" stroke="#52615b" strokeWidth="1.5" />
      <circle cx="86" cy="347" r="6" fill="#52615b" />
      <text x="101" y="332" fontFamily="Arial" fontSize="9" fill="#424c48">Use caneta azul ou preta e preencha completamente apenas uma alternativa.</text>
      <text x="101" y="350" fontFamily="Arial" fontSize="9" fill="#424c48">Não rasure, não dobre a folha e mantenha os marcadores dos cantos visíveis.</text>

      {[0, 1].map((column) => (
        <g key={column}>
          <rect x={65 + column * 382} y="378" width="327" height="620" rx="8" fill="none" stroke="#d5dcd8" />
          <rect x={65 + column * 382} y="378" width="327" height="32" rx="8" fill="#edf2ef" />
          <text x={84 + column * 382} y="399" fontFamily="Arial" fontSize="9" fontWeight="700" fill="#55615c">QUESTÃO</text>
          {options.slice(0, assessment.optionCount).map((option, index) => (
            <text key={option} x={164 + column * 382 + index * 43} y="399" textAnchor="middle" fontFamily="Arial" fontSize="9" fontWeight="700" fill="#55615c">{option}</text>
          ))}
          {Array.from({ length: 20 }, (_, row) => {
            const questionIndex = row + column * 20
            if (questionIndex >= assessment.questionCount) return null
            return (
              <g key={row}>
                {row > 0 && <line x1={78 + column * 382} y1={410 + row * 29.4} x2={379 + column * 382} y2={410 + row * 29.4} stroke="#edf0ee" />}
                <text x={95 + column * 382} y={bubbleCenter(questionIndex, 0).y + 3.2} textAnchor="middle" fontFamily="Arial" fontSize="10" fontWeight="700" fill="#26312d">{String(questionIndex + 1).padStart(2, '0')}</text>
                {options.slice(0, assessment.optionCount).map((option, optionIndex) => {
                  const center = bubbleCenter(questionIndex, optionIndex)
                  return (
                    <g key={option}>
                      <circle cx={center.x} cy={center.y} r="9" fill="white" stroke="#4b5651" strokeWidth="1.25" />
                      <text x={center.x} y={center.y + 3.2} textAnchor="middle" fontFamily="Arial" fontSize="7.5" fill="#5c6662">{option}</text>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </g>
      ))}

      <line x1="66" y1="1023" x2="728" y2="1023" stroke="#d8dedb" />
      <text x="66" y="1045" fontFamily="Arial" fontSize="8.5" fill="#69736f">{school.name} · {school.city}/{school.state}</text>
      <text x="728" y="1045" textAnchor="end" fontFamily="Arial" fontSize="8.5" fill="#69736f">{assessment.questionCount} questões</text>
      <text x="397" y="1090" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#a2aaa6">{payload}</text>
    </svg>
  )
}

export function PrintableSheets({ students, assessment, classes, school }) {
  return (
    <div className="print-root">
      {students.map((student) => (
        <div className="print-page" key={student.id}>
          <AnswerSheet
            student={student}
            assessment={assessment}
            classroom={classes.find((item) => item.id === student.classId)}
            school={school}
          />
        </div>
      ))}
    </div>
  )
}
