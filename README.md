# Sistema de Avaliações — correção inteligente de simulados

Aplicação web para organizar alunos e turmas, criar simulados, gerar folhas A4 individualizadas com QR Code, corrigir marcações a partir de imagens e analisar resultados.

## Executar

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev
```

O endereço local padrão é `http://localhost:4173`. Para validar o pacote de produção:

```bash
npm run build
npm run preview
```

## Fluxos implementados

- painel com aplicações, participação, pendências e evolução de desempenho;
- alunos e turmas, com cadastro manual, filtros, busca e exportação CSV;
- importação de relatórios SEGES em CSV ou XLSX;
- reconhecimento automático e ajuste manual das colunas importadas;
- atualização idempotente por matrícula, sem duplicação ao reenviar um relatório;
- criação de simulados com 10, 20, 30 ou 40 questões e alternativas A–D/A–E;
- classificação de cada questão por área de conhecimento ou componente personalizado;
- associação de um mesmo simulado a uma ou mais turmas;
- gabarito padrão, versões compartilhadas por turma ou uma versão exclusiva por aluno;
- aleatorização individual somente das questões, somente das alternativas ou de ambas;
- edição posterior da identificação, turmas, questões, alternativas, gabaritos e versões do simulado;
- aviso com a quantidade de provas afetadas e recálculo das correções, sem apagar as respostas digitalizadas, após mudanças estruturais;
- encerramento e reabertura de simulados, preservando resultados e retirando avaliações encerradas das filas de pendências;
- folha A4 individual, com dados do aluno, QR Code e quatro marcadores de alinhamento;
- impressão em lote ou geração de PDF, com folha de respostas e prova agrupadas por aluno;
- folha avulsa sem aluno vinculado, para preencher à mão e cadastrar o estudante durante a correção;
- leitura de JPG, PNG ou WEBP, inclusive pela câmera do celular;
- detecção de QR Code, guias, marcações, respostas em branco, múltiplas e incertas;
- seleção automática do gabarito correto a partir da turma do aluno identificado;
- revisão manual antes de salvar e fila própria para resolver ou confirmar marcações múltiplas, em branco e ambíguas;
- consulta das correções por simulado e turma, com detalhamento de cada resposta marcada;
- resultados por aluno, turma e área de conhecimento, com exportação CSV;
- persistência local da demonstração e restauração da base inicial.

## Importação do SEGES

O caminho operacional adotado é o relatório nominal exportado pelo usuário institucional:

1. gerar no SEGES a relação de alunos da escola para o ano letivo atual;
2. gerar a relação com `Número`, `Nome do aluno`, `Status`, `Nome da turma` e `Data e hora da captura`;
3. exportar em CSV, XLSX ou PDF com texto selecionável do **Relatório de Alunos por Turma**;
4. abrir **Importar SEGES**, enviar o arquivo, definir o turno, conferir o mapeamento e concluir.

Nome, turma e status são os campos obrigatórios; o número sequencial do relatório não é tratado como matrícula. A série pode ser obtida do primeiro dígito da turma (`1`, `2` ou `3`), o turno pode ser definido manualmente e escola/INEP podem usar os dados cadastrados em **Configurações → Escola**. Alunos com status `Matriculado`, `Sem status` ou `Em transferência` são incluídos como `Ativo`; registros `Transferido` e linhas auxiliares são ignorados. Turmas inexistentes são criadas e, sem matrícula externa, os alunos são conciliados por nome e turma.

No PDF, o ID do aluno é usado como matrícula, os nomes quebrados em várias linhas são reunidos e a turma é mantida nas páginas de continuação. `Novato` é convertido em `Matriculado`, mantendo a situação original na coluna `Situação no PDF`. Registros idênticos repetidos no relatório são removidos. Telefones, documentos e datas de nascimento não são importados. PDFs digitalizados sem texto precisam ser convertidos por OCR antes do envio. Defina o turno na conferência antes de concluir.

Para extrair CSVs localmente: `node scripts/extract-seges-pdf.mjs out/alunos "caminho/relatório.pdf"`. Arquivos com “matutino” ou “vespertino” no nome recebem o turno correspondente; nos demais casos, defina o turno ao importar o CSV.

Documentos da SEDU confirmam que o SEGES concentra dados de alunos, turmas e escolas e disponibiliza relatórios. Uma especificação oficial também descreve o consumo de um relatório de alunos do SEGES e relaciona campos como matrícula, nome, tipo de ensino, série, turno e escola.

O Sistema de Avaliações foi intencionalmente mantido independente do SEGES: não existe sincronização direta, automação de login nem armazenamento de credenciais. Toda atualização ocorre quando o usuário importa uma nova planilha.

O cabeçalho institucional das folhas usa os dados cadastrados em **Configurações → Escola**, incluindo nome da unidade, endereço, município, UF e CEP.

## Exportação de notas para o SEGES

Em **Simulados → Detalhes**, a relação de alunos mostra a nota geral na escala de 0 a 10, o percentual de aproveitamento e a situação da correção. O botão **Exportar notas** permite escolher as turmas, a nota máxima e um único recorte por arquivo: resultado geral ou uma área/componente do simulado.

O CSV usa UTF-8, separador ponto e vírgula e uma casa decimal. Questões canceladas não entram no total de questões válidas. Correções pendentes de revisão, alunos sem correção e registros sem respostas detalhadas permanecem identificados no arquivo, mas sem nota, evitando que sejam lançados automaticamente. Para exportar várias áreas, gere um arquivo separado para cada recorte.

## Relatório de resultados

Em **Resultados → Gerar relatório**, escolha PDF A4, PDF em apresentação 16:9 ou PowerPoint editável (`.pptx`). O documento reúne os simulados selecionados e respeita os filtros de turma, área e faixa de desempenho. É possível visualizar o PDF antes de baixar e selecionar comparativos por turma, série/ano, área, simulado e questões, incluindo perfis individuais das turmas.

A opção **Planilha de notas** gera um arquivo `.xlsx` só com as notas, para os professores: uma aba por turma, com cada aluno em ordem alfabética, os acertos em cada área e o total/aproveitamento de cada simulado, além da média da turma. Simulados e áreas de conhecimento têm cores diferentes, e os totais são fórmulas que se recalculam se a planilha for editada. O botão **Exportar planilha** continua baixando o CSV completo do recorte (alunos, áreas e questões).

O relatório inclui resumo executivo, distribuição de desempenho, sugestões de acompanhamento e critérios de cálculo. As médias usam os percentuais de cada correção; áreas e questões usam acertos sobre respostas válidas. A geração ocorre localmente, com textos e gráficos vetoriais, e distingue participações de estudantes únicos.

## Correção de PDF em lote

Na Central de correção, o campo de envio aceita imagens individuais ou um PDF com até 100 páginas e 100 MB. Cada página deve conter uma folha completa. O processamento ocorre localmente, identifica aluno, turma e simulado pelo QR Code e apresenta uma conferência do lote antes de salvar. Páginas sem identificação podem ser vinculadas manualmente; leituras ambíguas e páginas sem os quatro marcadores seguem para a fila de revisão.

Referências oficiais:

- [Manual de Gestão Escolar da SEDU](https://sedu.es.gov.br/Media/sedu/pdf%20e%20Arquivos/manuais/Manual%20da%20Gest%C3%A3o%20completo.pdf)
- [Especificação de funcionalidades com importação do relatório SEGES](https://sedu.es.gov.br/Media/sedu/pdf%20e%20Arquivos/Anexo%20II%20-%20Funcionalidades%20B%C3%A1sicas%20do%20Sistema.pdf)

## Como a correção funciona

A geometria da folha é fixa e compartilhada pelo gerador e pelo leitor:

1. o QR Code informa a versão do layout, aluno e simulado, com checksum contra erros de leitura;
2. os quatro marcadores corrigem enquadramento, escala e pequenas distorções de perspectiva;
3. o leitor mede o escurecimento no centro de cada bolha;
4. duas ou mais opções fortes viram **marcação múltipla**;
5. marcas fracas ou muito próximas viram **incertas** e entram na revisão;
6. respostas confirmadas são comparadas ao gabarito salvo.

O QR Code não contém nome, matrícula nem nota: identificadores internos, metadados do formato e um checksum contra erros de leitura.

## Banco de dados local e backup

Os dados ficam em `localStorage`, sem contas, perfis, servidor ou conexão externa. A análise da imagem também acontece no próprio dispositivo.

Como o banco pertence ao navegador e pode ser apagado pela limpeza dos dados do site, a tela **Configurações → Banco local** permite:

- baixar um backup JSON completo;
- restaurar o banco neste ou em outro computador;
- recuperar os dados demonstrativos iniciais.

É recomendável baixar um backup após cada rodada importante de importações ou correções. Para uso real, também devem ser feitos testes de calibração com as impressoras, scanners, canetas e celulares da escola.

## Estrutura principal

```text
src/
  components/AnswerSheet.jsx  folha SVG e impressão em lote
  lib/omr.js                  QR, alinhamento e leitura das marcações
  lib/seges.js                CSV/XLSX, mapeamento e atualização por matrícula
  pages/                      fluxos da aplicação
  data.js                     base demonstrativa
  styles.css                  interface responsiva e estilos de impressão
```

### Formatos da folha de respostas

As novas folhas usam uma página A4, com duas colunas equilibradas até 40 questões e três colunas de 41 a 90. O número de linhas é o teto da divisão pela quantidade de colunas: 45 questões ocupam 15 linhas por coluna; 60 ocupam 20. As bolhas têm raio 9 nas duas colunas e raio 7 nas três. Impressão e leitura compartilham a geometria em `src/lib/sheetFormat.js`.

O QR v4 registra o modelo `balanced-v4`, as quantidades de questões e alternativas, aluno, simulado e checksum. Ele é vetorial, com margem branca de quatro módulos e tamanho de aproximadamente 41 mm. A leitura tenta a imagem completa, recortes e retificação de perspectiva. Os elementos do QR são excluídos da detecção dos quatro marcadores OMR. Folhas avulsas também possuem QR; o aluno pode ser vinculado manualmente.

Folhas já impressas com QR v2 ou QR v3 (`fixed-90-v3`) continuam sendo lidas em suas coordenadas originais. O QR v1 é identificado, mas sua leitura é interrompida porque foi usado por grades diferentes sem registrar qual delas foi impressa; nesse caso é preciso gerar outra folha. Sem QR válido ou com quantidades registradas diferentes das do simulado, a leitura é interrompida. Correções já salvas são preservadas.

`npm run test:sheet-scan` renderiza o componente real de impressão e valida o QR vetorial, a identificação, a leitura e as posições das respostas em diferentes quantidades e escalas, além das grades v2/v3 e de um marcador ausente.

Sem os quatro marcadores validados, as questões ficam incertas e seguem para revisão. O fundo é estimado pelas alternativas mais claras das linhas próximas, evitando perder respostas pretas repetidas ou de folhas curtas.

A leitura mede o centro e uma faixa interna mais ampla de cada bolha, evitando a letra central e o contorno impresso. Essa segunda medida recupera preenchimentos parciais ou deslocados. Evidências fracas seguem para revisão; uma marca forte acompanhada de outra fraca também exige conferência. `npm run test:omr-scan-quality` verifica uma grade gerada artificialmente em diferentes escalas, contraste, compressão JPEG e pequena rotação. Antes de alinhar a folha, a imagem passa por uma correção de iluminação (fotos escuras, gradientes de luz, luz amarelada); a orientação é confirmada pela posição do QR, o que permite ler folhas fotografadas de cabeça para baixo ou de lado; e a grade projetada precisa coincidir com os contornos impressos das bolhas, senão a folha vai inteira para revisão em vez de ser corrigida com alinhamento errado. Quando a luz muda dentro de uma mesma linha (borda de sombra), cada bolha passa a ser comparada com o papel logo ao redor dela; sob luz uniforme a comparação continua sendo com a linha e as questões vizinhas. Em papel curvado, a grade acompanha os contornos impressos coluna a coluna. A confiança exibida para cada folha resume quão nítida foi a leitura de cada questão. `npm run test:omr-photo-conditions` simula fotos com perspectiva forte, rotação, papel curvo, pouca luz, sombra, ruído e JPEG. Os testes publicados não incluem documentos enviados por usuários.

Preencha toda a bolha com caneta azul ou preta, sem rasuras. Digitalize a folha completa com nitidez, sem sombras ou cortes. Os testes automatizados usam imagens sintéticas; fotos e digitalizações reais ainda precisam de conferência, especialmente com rotação acentuada, dobras ou baixa resolução.

## Relatório do aluno e boletim

Em **Turmas e alunos → Relatório do aluno** (ou clicando no nome do aluno na lista) aparecem, para cada aluno da turma, a nota de cada simulado comparada com a média da turma, o aproveitamento por área em cada aplicação, a evolução entre simulados e os pontos de atenção (queda de 15 pontos ou mais, área abaixo de 40% no último simulado, ausências). A lista da turma marca os alunos em atenção. **Boletim em PDF** gera o boletim do aluno aberto; **Boletins da turma** gera um PDF com um aluno por página, com as questões a retomar do último simulado. Provas anuladas aparecem como anuladas e ficam fora das médias.

## Nota TRI (opcional)

Em **Simulados → Detalhes**, a seção **Nota TRI** liga o cálculo para aquele simulado; desligada, nada muda. O modelo é o logístico de 3 parâmetros, como no ENEM, com o acerto ao acaso fixo em 1/nº de alternativas. Os parâmetros das questões são estimados com os próprios alunos (máxima verossimilhança marginal), separados por área e por versão de gabarito, e a nota de cada área sai por EAP. A escala é a do grupo: 500 é a média de quem fez a prova e 100 pontos equivalem a um desvio-padrão; a nota geral é a média das áreas. São necessárias pelo menos 30 folhas com o mesmo gabarito e 5 questões válidas por área; abaixo de 100 folhas a nota ainda oscila. A nota TRI aparece ao lado da nota atual no resultado do aluno (Resultados → clicar no aluno), no relatório do aluno, no boletim e na planilha de notas (colunas TRI por área e TRI geral), sem alterar a nota atual nem a exportação para o SEGES.

Há dois modos:

- **Estimada com os alunos**: o descrito acima, para simulados com questões próprias.
- **Parâmetros oficiais do ENEM**: para simulados montados com a prova do ENEM. O botão **Usar ENEM 2025** compara o gabarito de cada versão com os gabaritos oficiais de todos os cadernos (cor, área e, em Linguagens, a língua estrangeira), em blocos de 45 questões, e grava os parâmetros a, b e c do INEP para as versões que batem em pelo menos 90%. A nota sai na escala do ENEM e funciona com qualquer número de alunos. Itens abandonados pelo INEP e questões anuladas ou canceladas no simulado ficam fora. Conferido com 7.741 notas de participantes do ENEM 2025: a diferença máxima foi de 0,31 ponto.

Em ambos os modos, **Turmas com nota TRI** limita o cálculo às turmas marcadas.

Para outro ano do ENEM, use **Importar ITENS_PROVA de outro ano** com o arquivo `DADOS/ITENS_PROVA_<ano>.csv` dos microdados do INEP. Para que o ano venha com o app, gere o arquivo compacto com `npm run build:enem-params -- <ITENS_PROVA.csv> <ano>` (cria `src/data/enem<ano>.json`) e acrescente o ano em `BUNDLED_YEARS` em `src/components/TriSettings.jsx`. Os dados de 2025 usados na validação estão em `data/enem/2025/` e o teste é `npm run test:enem-tri`.

## Aplicativo desktop e arquivo das folhas

`npm run desktop` gera a versão com caminhos relativos (`build:desktop`) e abre o aplicativo Electron; `npm run make` cria o instalador. Os dados do desktop ficam separados dos do navegador: para levar a base, baixe um backup no navegador e restaure no aplicativo.

No desktop, **Configurações → Folhas escaneadas** define uma pasta (por exemplo, no OneDrive). Ao salvar correções, o app copia o PDF ou a imagem para `<pasta>/<código do simulado>/<data>_<nome>_<hash>.<ext>` e guarda em cada correção o arquivo e a página. Um mesmo arquivo enviado de novo não é duplicado. O botão **Folha original** (detalhes da correção, fila de revisões e tela do aluno) mostra a página exata e permite abrir o arquivo ou mostrá-lo na pasta. O processo principal só lê e grava dentro da pasta escolhida.

### Backup automático (desktop)

Em **Configurações → Banco local → Backup automático**, escolha uma pasta (por exemplo, `OneDrive\JCR\2026\Backups Turmas`). O app grava `backup-automatico-AAAA-MM-DD_hh-mm-ss.json` ao abrir, no máximo a cada 5 minutos depois de alterações e ao fechar a janela. Ficam as 20 cópias mais novas e a última de cada dia dos 30 dias mais recentes. O arquivo é o mesmo do backup manual e se restaura em **Restaurar backup**.

### Atualização automática (desktop)

A cada merge na `main`, o workflow **Publicar app desktop** gera o instalador do Windows (`npm run make`) e publica uma Release `v0.2.<n>` com os arquivos do Squirrel. O app instalado pelo `Setup.exe` procura versões novas em update.electronjs.org (que lê essas Releases) ao abrir e a cada 4 horas, baixa em segundo plano e pergunta se pode reiniciar; antes de reiniciar, grava o banco e o backup automático. Os dados ficam em `%APPDATA%\Corretor de Simulados` e não são afetados. Sem certificado de assinatura, o Windows pode mostrar o aviso do SmartScreen na primeira instalação. No modo de teste (`npm run desktop`) a atualização fica desligada.
