import { MIN_RESPONSES } from './itemAnalysis.js'
import { HIGH_BLANK_RATE, LOW_SCORE } from './teacherInsights.js'
import { HIGH_AGREEMENT, IDENTICAL_MIN_ANSWERS, SIMILARITY_LEVELS } from './similarity.js'

// Explicações das métricas da aba Análise, com as mesmas faixas usadas nos cálculos.
export const CORRELATION_HELP = {
  mean: {
    title: 'Média da prova',
    text: 'Porcentagem média de acertos dos alunos no recorte escolhido. O desvio mostra o quanto as notas se espalham: com desvio de 12 p.p., a maioria dos alunos ficou até 12 pontos acima ou abaixo da média.',
  },
  alpha: {
    title: 'Confiabilidade (alfa de Cronbach)',
    text: 'Indica se as questões medem a mesma coisa de forma consistente, ou seja, se quem acerta umas tende a acertar as outras. Vai de 0 a 1. Com alfa alto, a nota é um bom retrato do aluno.',
    ranges: [['green', '0,80 ou mais', 'Boa'], ['blue', '0,70 a 0,79', 'Aceitável'], ['ochre', '0,50 a 0,69', 'Baixa: compare alunos com cautela'], ['red', 'abaixo de 0,50', 'Muito baixa: as questões medem coisas pouco relacionadas']],
    note: 'Provas curtas ou que misturam conteúdos muito diferentes tendem a ter alfa menor.',
  },
  review: {
    title: 'Questões para revisar',
    text: 'Questões com gabarito suspeito, que discriminam ao contrário ou que quase não discriminam (abaixo de 0,20). Vale reler o enunciado, as alternativas e o gabarito antes de divulgar as notas.',
    note: `Só é avaliado com ${MIN_RESPONSES} folhas ou mais da mesma versão.`,
  },
  attention: {
    title: 'Alunos em atenção',
    text: `Alunos com nota abaixo de ${LOW_SCORE}% ou com ${Math.round(HIGH_BLANK_RATE * 100)}% ou mais das questões em branco. Muitos brancos podem indicar falta de tempo ou desistência.`,
  },
  correctRate: {
    title: 'Acerto',
    text: 'Parte dos alunos que acertou a questão (quem deixou em branco conta no total). É o índice de dificuldade: quanto menor, mais difícil.',
    ranges: [['red', 'abaixo de 40%', 'Difícil'], ['ochre', '40% a 59%', 'Média'], ['green', '60% a 79%', 'Fácil'], ['green', '80% ou mais', 'Muito fácil']],
    note: 'Abaixo de 20% a questão é marcada como "Muito difícil"; acima de 90%, como "Muito fácil".',
  },
  discrimination: {
    title: 'Discriminação',
    text: 'Mostra se a questão separa quem domina o conteúdo de quem não domina. Compara acertar esta questão com a nota no restante da prova (correlação ponto-bisserial, de −1 a 1). Se quem acerta também vai bem no resto, a questão discrimina bem.',
    ranges: [['green', '0,40 ou mais', 'Excelente'], ['green', '0,30 a 0,39', 'Boa'], ['neutral', '0,20 a 0,29', 'Regular: pode melhorar'], ['ochre', '0 a 0,19', 'Fraca: acertar quase não depende de saber (chute, questão fácil ou difícil demais)'], ['red', 'abaixo de 0', 'Negativa: os melhores alunos erram mais; enunciado ambíguo ou gabarito errado']],
    note: `Com menos de ${MIN_RESPONSES} folhas o valor aparece, mas não entra no diagnóstico.`,
  },
  options: {
    title: 'Alternativas marcadas',
    text: 'Porcentagem de alunos que marcou cada letra; o fundo de cada quadro enche conforme essa porcentagem. Em verde está o gabarito, em roxo a alternativa errada que mais atraiu (25% ou mais) e "Br" são as respostas em branco.',
    note: 'Quando uma alternativa errada recebe 30% ou mais e supera o gabarito, a questão aparece como "Erro comum": um equívoco compartilhado que vale discutir em sala.',
  },
  diagnosis: {
    title: 'Diagnóstico',
    text: 'Resumo da questão. Quando mais de uma regra vale, aparece a primeira desta lista:',
    ranges: [['red', 'Gabarito suspeito', 'os melhores alunos preferiram outra alternativa'], ['red', 'Discrimina ao contrário', 'discriminação negativa'], ['ochre', 'Muito difícil', 'acerto abaixo de 20%'], ['purple', 'Erro comum', 'alternativa errada com 30% ou mais e acima do acerto'], ['blue', 'Muito fácil', 'acerto acima de 90%'], ['ochre', 'Pouco discrimina', 'discriminação abaixo de 0,20'], ['green', 'Boa questão', 'discriminação de 0,30 ou mais'], ['neutral', 'Adequada', 'nenhum dos casos acima']],
  },
  areaCorrelation: {
    title: 'Correlação entre áreas',
    text: 'Mostra se as notas de duas áreas andam juntas (r de Pearson, de −1 a 1). Perto de 1: quem vai bem numa tende a ir bem na outra. Perto de 0: são dificuldades independentes e pedem trabalho separado. Negativa (em vermelho): quem vai bem numa tende a ir mal na outra.',
    ranges: [['green', '0,50 ou mais', 'Forte'], ['green', '0,30 a 0,49', 'Moderada'], ['neutral', '0,10 a 0,29', 'Fraca'], ['neutral', 'abaixo de 0,10', 'Desprezível']],
    note: '"Incerta" quer dizer que, com esse número de alunos, a relação pode ser acaso. Como a tabela compara vários pares de áreas ao mesmo tempo, o p é ajustado (Benjamini-Hochberg) antes de comparar com 0,05. Passe o mouse sobre a célula para ver r, número de alunos e o p ajustado.',
  },
  areaAlpha: {
    title: 'Alfa da área',
    text: 'O mesmo alfa de Cronbach da prova, calculado só com as questões da área. Mostra se essas questões medem a mesma habilidade. Áreas com poucas questões tendem a ter alfa menor.',
    ranges: [['green', '0,80 ou mais', 'Boa'], ['blue', '0,70 a 0,79', 'Aceitável'], ['ochre', '0,50 a 0,69', 'Baixa'], ['red', 'abaixo de 0,50', 'Muito baixa']],
  },
  deviation: {
    title: 'Desvio',
    text: 'Desvio padrão das notas, em pontos percentuais. Desvio pequeno: a turma está parecida. Desvio grande: há alunos muito acima e muito abaixo da média, o que pede atividades diferentes para cada grupo.',
  },
  classAreas: {
    title: 'Média por turma e área',
    text: 'Porcentagem média de acertos de cada turma em cada área.',
    ranges: [['red', 'abaixo de 40%', 'Crítico'], ['ochre', '40% a 59%', 'Atenção'], ['green', '60% a 79%', 'Bom'], ['green', '80% ou mais', 'Muito bom']],
  },
  similarity: {
    title: 'Similaridade entre alunos',
    text: 'Compara as folhas de cada par de alunos da mesma turma e da mesma versão. Acertar as mesmas questões é normal entre bons alunos; o sinal que chama atenção é errar com a mesma alternativa errada muitas vezes.',
    ranges: [['red', 'Alta', `${SIMILARITY_LEVELS.high.sameWrong} ou mais erros iguais e chance de coincidência abaixo de 0,1%`], ['ochre', 'Atenção', `${SIMILARITY_LEVELS.medium.sameWrong} ou mais erros iguais e chance de coincidência abaixo de 1%, ou folhas 100% iguais (${IDENTICAL_MIN_ANSWERS} ou mais respostas) com ${SIMILARITY_LEVELS.medium.sameWrong} ou mais erros em comum`], ['neutral', 'Baixa', 'padrão compatível com acaso']],
    note: 'É um indicador para conferir a folha original e o mapa de sala, não uma prova de cola.',
  },
  sameWrong: {
    title: 'Erros iguais',
    text: 'Questões em que nenhum dos dois acertou e os dois responderam igual (mesma alternativa errada, mesma marcação múltipla ou os dois em branco), de um total de questões que os dois erraram. Ao lado, quantos erros iguais seriam esperados se cada um tivesse errado por conta própria, calculado com as alternativas erradas que a turma mais escolheu em cada questão.',
    note: 'Errar igual numa questão em que quase todos erram com a mesma letra pesa pouco; errar igual numa alternativa rara pesa muito.',
  },
  coincidence: {
    title: 'Chance de coincidência',
    text: 'Probabilidade de dois alunos que erram de forma independente terem pelo menos esse número de erros iguais (modelo de Poisson). Quanto menor, menos provável que seja acaso.',
    ranges: [['red', 'abaixo de 0,1%', 'muito improvável por acaso'], ['ochre', '0,1% a 0,9%', 'improvável'], ['neutral', '1% ou mais', 'pode ser acaso']],
  },
  agreement: {
    title: 'Respostas iguais',
    text: `Parte das questões respondidas em que os dois marcaram exatamente o mesmo, contando acertos e erros. A sequência mostra o maior trecho seguido de respostas idênticas. Acima de ${HIGH_AGREEMENT}% é comum entre dois alunos que vão muito bem: se os dois acertaram quase tudo, as respostas são iguais porque são as certas, e isso sozinho não indica cola. Por isso um par com 100% de respostas iguais pode ficar como Baixa; o motivo aparece abaixo do nível.`,
  },
  dIndex: {
    title: 'Índice D',
    text: 'Diferença entre o acerto dos 27% melhores alunos e o dos 27% piores. Vai de −1 a 1; 0,30 ou mais indica que a questão separa bem os dois grupos. Aparece só na planilha exportada.',
  },
}

export const CORRELATION_HELP_ORDER = ['mean', 'alpha', 'correctRate', 'discrimination', 'options', 'diagnosis', 'areaCorrelation', 'areaAlpha', 'deviation', 'review', 'attention', 'classAreas', 'similarity', 'sameWrong', 'coincidence', 'agreement', 'dIndex']
