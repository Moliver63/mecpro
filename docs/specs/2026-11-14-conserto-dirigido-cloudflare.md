# Conserto dirigido de campo (Cloudflare) e melhor versão entre tentativas

## Problema

Evidência: geração da campanha 810 (projeto 49), log do Render em 14/11 11:59 UTC.

1. **A última versão vence, mesmo sendo pior.** Card 0: a tentativa 1 chegou a
   score 73 (`Reescrita escolhida` com groq 73 contra gemini 70). A tentativa 2
   só teve candidato Gemini (Groq em 429) com 65. O laço em
   `improveCreativeIfWeak` (`server/ai.ts`) faz `current = repair.candidate`
   sem comparar, e o card terminou em 65.
2. **Erro objetivo em um campo dispara reescrita do criativo inteiro.**
   Headline acima de 40, alegação não confirmada numa description, placeholder
   ou headline repetida entre cards são erros de UM campo, mas a correção é o
   prompt completo de reescrita (≈2.300 tokens de entrada), que também mexe
   nos campos que estavam bons.

## Mudança

### A. Melhor versão entre tentativas

O laço guarda `melhor` = {criativo, campos pendentes}. O criativo de entrada,
com os pendentes recebidos (`fields`), é a primeira versão guardada. Toda
versão nova (do conserto ou da reescrita) é comparada com `melhor`
(`manterMelhorVersao`, pura) pela mesma ordem de
`escolherMelhorReescrita`, usando os campos pendentes no lugar de
"rejeitados" e contando placeholder como problema extra. Empate fica com a
versão já guardada. No fim do laço (antes da sanitização de placeholder e do
corte de comprimento, que não mudam), o criativo e os pendentes usados são os
de `melhor`. A semântica de `needsReview` não muda: continua considerando
score, placeholder, corte, pendentes e Fact Guard da versão final.

### B. Conserto dirigido antes da reescrita

No começo de cada tentativa, `camposComErroObjetivo(criativo, facts,
duplicados)` (função pura nova em `creativeRewriteGuard.ts`) lista os campos
com erro objetivo e o motivo:

- vazio ou acima do limite de `CREATIVE_TEXT_LIMITS`
- placeholder
- Fact Guard reprovado no campo isolado (mesma checagem do
  `repairCreativeFields`)
- headline/description repetida de outro card (reparo de irmãos)

`bodyText` é tratado como `copy` e `shortDescription` como `description`
(espelhos; `applyTextPatch` sincroniza).

Se houver campos com erro e o conserto estiver disponível, o Cloudflare
Workers AI (`chamarCloudflareWorkersAI`, Qwen3) recebe SÓ esses campos: o
texto atual, o motivo exato, o limite, os fatos confirmados e (se for
duplicata) os textos dos irmãos que não podem ser repetidos. Ele devolve um
JSON só com esses campos. A resposta passa por `repairCreativeFields(atual,
resposta, facts, camposComErro)`, que só aplica os campos válidos. Se o
criativo ficar sem erro objetivo, com Fact Guard aprovado e score ≥ 75, o
laço termina sem chamar Gemini/Groq. Senão, a tentativa segue para a
reescrita de hoje, com as recomendações recalculadas sobre a versão
consertada.

"Score baixo" (hook fraco, falta de urgência) NÃO é erro objetivo e nunca vai
para o conserto dirigido.

Resposta do Qwen3: tira `<think>…</think>` e pega do primeiro `{` ao último
`}` antes do `parseCreativeRewrite` (`extrairJsonDeResposta`, pura).

### Disponibilidade e custo

- Só roda com `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN` configurados.
- A cota grátis (~10 mil neurons/dia) é dividida com o FLUX (imagens) e com o
  fallback do chat. Limite próprio: `CLOUDFLARE_FIX_DAILY_LIMIT` chamadas por
  dia UTC (padrão 40), no máximo 2 em voo, teto de 12 s, `max_tokens` 1024,
  prompt com `/no_think`. Acima disso o conserto não roda e a tentativa segue
  como hoje.
- Interruptor `COPY_TARGETED_FIX=off`; também desliga com `llmMode = off`.
- Estimativa (revisão): ~38 neurons por chamada (≈1,5k entrada + 1k saída);
  40 chamadas ≈ 1,5k neurons ≈ 15% da cota, o equivalente a ~26 imagens FLUX.
  Quando a cota acaba, o FLUX cai para o fallback até 00:00 UTC.
- O limite é global da plataforma, não por usuário, e o contador é por
  processo (deploy ou reinício zera). Aceito nesta versão: protege de disparo
  em massa, não é contabilidade nem justiça entre clientes.

## Arquivos

- `server/creativeRewriteGuard.ts`: `camposComErroObjetivo`,
  `extrairJsonDeResposta`
- `server/ai.ts`: laço de `improveCreativeIfWeak` (conserto + melhor versão) e
  função `callCloudflareFieldFix` com o limite diário
- `server/__tests__/creativeRewriteSelection.test.ts`: casos novos

## Fora do escopo

Geração inicial; Fact Guard; limiar 75; número de tentativas; `truncarCamposNoLimite`
e `stripPlaceholders` (continuam como último recurso); a regra de urgência do
score.

## Portas afetadas

Tela, chat e MCP passam pela mesma geração. Nenhuma regra de bloqueio muda.

## Dados

Sem tabela nova. Logs: `Conserto dirigido` (campos, motivo, aceitos,
rejeitados, desfecho do Cloudflare; sem texto de criativo) e
`Melhor versão mantida` quando a versão final do laço não é a última.

## Como provar

- Testes: `camposComErroObjetivo` acha comprimento, placeholder (inclusive
  `[]`), alegação não confirmada e duplicata, mapeia espelhos e não acusa
  campo limpo; `extrairJsonDeResposta` tira `<think>` e texto em volta;
  `motivoParaRecusarConserto` recusa negação perdida e número novo;
  `manterMelhorVersao` mantém 73 contra 65 (caso real da 810), prefere Fact
  Guard aprovado a score e fica com a guardada no empate.
- Suites: `test:rewrite-selection`, `test:fact-guard`, `test:quality-gates`,
  `test:creative-scoring`; `tsc` com 4 GB sem erro novo.
- Produção: gerar rascunho do projeto 49 e ler `Conserto dirigido` e
  `Melhor versão mantida` no log.

## Revisão Goldfish

| Rodada | Fase | Bloqueantes | Riscos | Resultado |
|---|---|---|---|---|
| 1 | Especificação | 0 | 8 | Incorporados: trava de negação e de número novo, regras proibitivas no prompt, campo não resolvido não vira pendente, limite por card (2) e padrão 60 → 40 com estimativa de neurons, mesma regex de placeholder, conserto final depois da última reescrita, teste do caso 73 → 65. Aceito: limite global e por processo. |
| 2 | Diff | 1 (trava de número usava o texto do prompt, que inclui a lista PROIBIDO: "3 vagas", "24h" passavam) | 8 | Corrigido: números conhecidos vêm só de `textoDeFatosConfirmados` (offerAnchor, verifiedFacts, briefing) com teste que falha na versão anterior. Também: pendentes fora do ranking da melhor versão (reescrita 88 perdia para entrada 55); conserto preserva pendentes anteriores; recusa por limite não gasta a vez do card; 3 em voo; variável de limite vazia usa o padrão; espelho com texto diferente é acusado nele mesmo; teste de vírgula/ponto. Aceito: o laço de `improveCreativeIfWeak` segue sem teste de integração (só funções puras); número por extenso não é travado. |
