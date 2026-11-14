# Reescrita de criativo com dois provedores em paralelo

## Problema

A reescrita de criativo fraco (`improveCreativeIfWeak` em `server/ai.ts`,
score < 75, placeholder, conflito de fato ou campo fora do limite) chama um
único provedor por tentativa (`gemini()`, que só cai para outro provedor quando
o Gemini falha). Dois efeitos conhecidos:

- Cada tentativa de reescrita fica refém de um provedor só. (Correção da
  revisão: o registro de Gemini indisponível de 15 a 21/10 em
  `MEC_PRO_AI_CURRENT_STATE.md` é do modelo do chat, não da reescrita. Não
  há medição de quantas reescritas falham por provedor; o log novo mede.)
- `docs/CODEX_CHANGELOG`/`creativeRewriteGuard.ts` registram reescritas
  recusadas por schema e por comprimento (14/09, 21/09, 14/10) que esgotam as
  2 tentativas e terminam em `needsReview` ou `CREATIVE_REPAIR_REQUIRED`.

## Mudança

Em cada tentativa de reescrita, pedir o mesmo prompt a dois provedores ao mesmo
tempo: `gemini()` (como hoje) e `callGroqAPI()` (Groq, `openai/gpt-oss-120b`).
Cada resposta passa pelo MESMO caminho de validação de hoje
(`parseCreativeRewrite` → `repairCreativeFields`, que roda schema, placeholder
e Fact Guard campo a campo). Entre os candidatos válidos, escolher o melhor por
critério determinístico, nesta ordem:

1. Fact Guard do criativo inteiro aprovado
2. menos campos rejeitados pelo `repairCreativeFields`
3. menos problemas extras: headline/description repetida de outro card e
   vocabulário de outro segmento
4. menos problemas em `creativeTextIssues`
5. maior `scoreCreative().finalScore`
6. empate → Gemini (provedor primário)

Os dois candidatos partem da MESMA base (`current` antes da tentativa).
`pendingFields`, feedback e alinhamento de segmento seguem só do vencedor.
Falha de um provedor não descarta o outro. Se o candidato do Gemini já é
suficiente (Fact Guard ok, 0 rejeitados, 0 extras, 0 problemas de texto,
score ≥ 75), o Groq é cancelado e não se espera por ele.

Nenhum candidato válido → mesmo comportamento de hoje (erro cai no `catch` da
tentativa, feedback para a próxima).

A seleção é uma função pura nova em `server/creativeRewriteGuard.ts`
(`escolherMelhorReescrita`), com o score injetado por parâmetro, para poder
ser testada sem rede.

## Arquivos

- `server/ai.ts`: bloco `try` da tentativa dentro de `improveCreativeIfWeak`
  e uma função nova `callGroqRewriteCandidate` (não altera `callGroqAPI`)
- `server/creativeRewriteGuard.ts`: função pura de seleção
- `server/__tests__/creativeRewriteSelection.test.ts` (novo) + script
  `test:rewrite-selection` no `package.json`

## Fora do escopo

- Geração inicial da campanha (`generateCampaign`): o custo dobraria em toda
  geração. Aqui só paga quem já precisa de reescrita.
- Cadeia de fallback do `gemini()`; limiar 75; número de tentativas; Fact Guard.
- Chat, imagens, publicação.

## Portas afetadas

Tela, chat e MCP chamam a mesma geração (`generateCampaign` →
`enrichCreativesWithScoresAndImages`). Nenhuma regra de bloqueio muda; só a
fonte dos candidatos de reescrita.

## Dados

Nenhuma tabela ou coluna. Log novo `Reescrita escolhida` com provedor vencedor
e scores dos candidatos, para medir se o segundo provedor vence alguma vez.

## Custos e limites

- Chamadas Groq extras: no máximo 2 por criativo fraco (uma por tentativa).
- Groq tem cota própria e rotação de chave (`getAvailableGroqKey`). Sem chave,
  `callGroqAPI` devolve `null` e o fluxo é idêntico ao de hoje.
- `callGroqRewriteCandidate`: só `openai/gpt-oss-120b` (nunca o 20b, que
  trunca o prompt em 800 caracteres), sem retry nem espera em 429, cancelável
  por `AbortSignal`, teto de 12s, no máximo 2 chamadas em voo no processo.
  Mais que isso, o candidato extra simplesmente não existe.
- Latência: só soma quando o Gemini não resolveu sozinho, e no máximo 12s por
  tentativa.
- Interruptor: `COPY_MULTI_PROVIDER_REWRITE=off` (lido a cada chamada, padrão
  ligado, global). Também desliga com `llmMode = off`, em que o Groq já é o
  único provedor.
- Fatos do cliente passam a ir ao Groq em toda reescrita com candidato extra,
  não só no fallback.
- Log `Reescrita escolhida` não contém texto de criativo.

## Riscos conhecidos

- `gemini()` pode cair internamente no Groq; aí os dois candidatos vêm do Groq.
- Custo do candidato extra fica em `improve_creative_groq` na telemetria, sem
  `userId`/`projectId` (mesma limitação do `callGroqAPI`).

## Como provar

- Teste unitário: candidato com campo rejeitado perde para candidato completo;
  candidato com Fact Guard reprovado perde mesmo com score maior; empate fica
  com Gemini; lista vazia devolve `null`.
- `npm run test:fact-guard`, `npm run test:quality-gates`,
  `npm run test:creative-scoring`, `npm run check:server` sem erro novo.
- Produção: log `Reescrita escolhida` aparece em geração com criativo fraco.

## Revisão Goldfish

| Rodada | Fase | Bloqueantes | Riscos | Resultado |
|---|---|---|---|---|
| 1 | Especificação | 1 (modelo 20b com prompt truncado) | 6 | Bloqueante resolvido com `callGroqRewriteCandidate` só 120b; riscos 2-7 incorporados (cota, base única, falha parcial, latência, irmãos/segmento, ordem do Fact Guard) |
| 2 | Diff | 0 | 7 | Corrigidos: teste que não provava (score igual nos dois), critérios sem teste (agora 10 casos, todas as inversões de ordem falham), `max_tokens` 2048 → 8192 (gpt-oss raciocina), log mede todo desfecho do Groq e scores de cada candidato, `try/finally` no timer. Aceitos: cancelamento não garante que o Groq não cobre; limite de 2 em voo pode cair em cards que o Gemini resolveria. Fora do escopo: `check:server` estoura memória com 1024 MB e sai com código 0 (39 erros TS pré-existentes, nenhum novo). |
