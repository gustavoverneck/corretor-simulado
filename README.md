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
- gabarito padrão ou versão específica para cada turma;
- edição, cópia entre turmas e recálculo das correções após alterar um gabarito;
- encerramento e reabertura de simulados, preservando resultados e retirando avaliações encerradas das filas de pendências;
- folha A4 individual, com dados do aluno, QR Code e quatro marcadores de alinhamento;
- impressão em lote ou geração de PDF, uma folha por aluno;
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
3. exportar em CSV ou XLSX;
4. abrir **Importar SEGES**, enviar o arquivo, definir o turno, conferir o mapeamento e concluir.

Nome, turma e status são os campos obrigatórios; o número sequencial do relatório não é tratado como matrícula. A série pode ser obtida do primeiro dígito da turma (`1`, `2` ou `3`), o turno pode ser definido manualmente e escola/INEP podem usar os dados cadastrados em **Configurações → Escola**. Somente alunos com status `Sem status` ou `Em transferência` são incluídos; registros `Transferido` e linhas auxiliares são ignorados. Turmas inexistentes são criadas e, sem matrícula externa, os alunos são conciliados por nome e turma.

Documentos da SEDU confirmam que o SEGES concentra dados de alunos, turmas e escolas e disponibiliza relatórios. Uma especificação oficial também descreve o consumo de um relatório de alunos do SEGES e relaciona campos como matrícula, nome, tipo de ensino, série, turno e escola.

O Sistema de Avaliações foi intencionalmente mantido independente do SEGES: não existe sincronização direta, automação de login nem armazenamento de credenciais. Toda atualização ocorre quando o usuário importa uma nova planilha.

O cabeçalho institucional das folhas usa os dados cadastrados em **Configurações → Escola**, incluindo nome da unidade, endereço, município, UF e CEP.

## Exportação de notas para o SEGES

Em **Simulados → Detalhes**, a relação de alunos mostra a nota geral na escala de 0 a 10, o percentual de aproveitamento e a situação da correção. O botão **Exportar notas** permite escolher as turmas, a nota máxima e um único recorte por arquivo: resultado geral ou uma área/componente do simulado.

O CSV usa UTF-8, separador ponto e vírgula e uma casa decimal. Questões canceladas não entram no total de questões válidas. Correções pendentes de revisão, alunos sem correção e registros sem respostas detalhadas permanecem identificados no arquivo, mas sem nota, evitando que sejam lançados automaticamente. Para exportar várias áreas, gere um arquivo separado para cada recorte.

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

O QR Code não contém nome, matrícula nem nota: somente identificadores internos e um checksum contra erros de leitura.

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
