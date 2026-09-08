import { ImagePlus, Trash2 } from 'lucide-react'
import { formatImageSource } from '../lib/fullAssessment'
import { Button } from './ui'

const imageWidth = (question) => Math.min(100, Math.max(20, Number(question.imageWidth) || 60))

export function FullAssessmentEditor({ questions, optionCount, onChange, notify }) {
  function update(index, patch) {
    onChange(questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question))
  }

  function updateAlternative(questionIndex, optionIndex, value) {
    update(questionIndex, {
      alternatives: questions[questionIndex].alternatives.map((item, index) => index === optionIndex ? value : item),
    })
  }

  function loadImage(index, file) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      notify?.('Arquivo inválido', 'Selecione uma imagem PNG, JPEG, WEBP ou SVG.', 'warning')
      return
    }
    if (file.size > 800 * 1024) {
      notify?.('Imagem muito grande', 'Use uma imagem otimizada de até 800 KB para preservar o banco de dados local.', 'warning')
      return
    }
    const reader = new FileReader()
    reader.onload = () => update(index, {
      image: reader.result,
      imageName: file.name,
      imageWidth: imageWidth(questions[index]),
    })
    reader.readAsDataURL(file)
  }

  return (
    <div className="full-question-editor">
      <header>
        <div>
          <strong>Questões da prova</strong>
          <small>Use <code>$...$</code> para equações em linha e <code>$$...$$</code> para equações destacadas.</small>
        </div>
      </header>
      {questions.map((question, index) => {
        const width = imageWidth(question)
        const source = formatImageSource(question.imageSource)
        return (
          <article className="full-question-card" key={question.id}>
            <div className="full-question-number">{String(index + 1).padStart(2, '0')}</div>
            <div className="full-question-content">
              <label>
                <span>Enunciado e equações LaTeX</span>
                <textarea
                  rows="4"
                  value={question.statement}
                  onChange={(event) => update(index, { statement: event.target.value })}
                  placeholder="Ex.: Calcule o valor de $x$ na equação $2x + 4 = 10$."
                />
              </label>
              <div className="full-question-image">
                <label className="button button-secondary button-sm">
                  <ImagePlus size={15} />
                  {question.image ? 'Trocar imagem' : 'Adicionar imagem'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(event) => loadImage(index, event.target.files?.[0])}
                  />
                </label>
                {question.image && (
                  <>
                    <img src={question.image} alt={`Ilustração da questão ${index + 1}`} />
                    <span>{question.imageName}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      onClick={() => update(index, { image: null, imageName: '', imageSource: '', postImageText: '' })}
                    >
                      Remover
                    </Button>
                  </>
                )}
              </div>
              {question.image && (
                <>
                  <div className="full-question-image-settings">
                    <label>
                      <span>Tamanho na prova</span>
                      <div>
                        <input
                          type="range"
                          min="20"
                          max="100"
                          step="5"
                          value={width}
                          onChange={(event) => update(index, { imageWidth: Number(event.target.value) })}
                          aria-label={`Largura da imagem da questão ${index + 1}`}
                        />
                        <output>{width}%</output>
                      </div>
                    </label>
                    <label>
                      <span>Fonte da imagem (ABNT)</span>
                      <input
                        type="text"
                        maxLength="240"
                        value={question.imageSource || ''}
                        onChange={(event) => update(index, { imageSource: event.target.value })}
                        placeholder="Ex.: IBGE (2024)."
                      />
                    </label>
                    <label className="full-question-post-image-text">
                      <span>Texto após a figura</span>
                      <textarea
                        rows="3"
                        maxLength="1200"
                        value={question.postImageText || ''}
                        onChange={(event) => update(index, { postImageText: event.target.value })}
                        placeholder="Texto opcional exibido entre a figura e as alternativas. Também aceita LaTeX."
                      />
                    </label>
                    <small>Na prova, a imagem ficará centralizada e a fonte aparecerá abaixo, em corpo menor e alinhada à direita.</small>
                  </div>
                  <div className="full-question-image-live-preview">
                    <small>Prévia do tamanho</small>
                    <figure style={{ width: `${width}%` }}>
                      <img src={question.image} alt="" />
                      {source && <figcaption>{source}</figcaption>}
                    </figure>
                    {question.postImageText && <p>{question.postImageText}</p>}
                  </div>
                </>
              )}
              <div className="full-alternatives">
                {Array.from({ length: optionCount }, (_, optionIndex) => {
                  const letter = String.fromCharCode(65 + optionIndex)
                  return (
                    <label className={question.correctIndex === optionIndex ? 'correct' : ''} key={letter}>
                      <input
                        type="radio"
                        name={`correct-${question.id}`}
                        checked={question.correctIndex === optionIndex}
                        onChange={() => update(index, { correctIndex: optionIndex })}
                      />
                      <strong>{letter}</strong>
                      <textarea
                        rows="2"
                        value={question.alternatives[optionIndex]}
                        onChange={(event) => updateAlternative(index, optionIndex, event.target.value)}
                        placeholder={`Alternativa ${letter} — texto ou LaTeX`}
                      />
                    </label>
                  )
                })}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
