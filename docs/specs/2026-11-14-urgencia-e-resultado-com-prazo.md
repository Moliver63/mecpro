# Urgência com piso quando não há condição; promessa de resultado com prazo vira alerta de revisão

> **Versão reduzida (decisão do Michel, 14/11)**, depois de duas rodadas Goldfish
> com bloqueantes. Ver "Versão final" abaixo; as seções A e B descrevem a
> tentativa anterior e ficam como histórico.

## Problema

Evidência: campanhas 806, 810 e 811 (projeto 49, Shadia Hasan), oferta "aula
completa por R$ 19,90, pagamento único, acesso por 7 dias", sem prazo, lote
nem desconto.

1. **Urgência impossível de cumprir.** `scoreCreative`
   (`server/creativeScoringEngine.ts`) dá 20% da nota à urgência, com base 25
   e +15 por termo da lista `URGENCY_TERMS`. Sem condição real, a urgência
   fica em 25 e a nota máxima prática fica abaixo de 75. A recomendação
   "Adicione urgência legítima com prazo..." entra no prompt de reescrita, que
   ao mesmo tempo proíbe inventar prazo. Resultado nas três campanhas: todo
   card em `needsReview`, com essa recomendação como única pendência.
   Observação honesta: na 811, a urgência 55 do card aprovado veio das
   palavras "agora" e "oferta" (que estão na lista), não da frase com
   "7 dias". A lista é fácil de "cumprir" com palavra vazia.
2. **Promessa de resultado com prazo passou.** Na 811, "Transforme-se em 7
   dias" (description) e "Transforme sua relação consigo mesmo em 7 dias!"
   (hook) passaram no Fact Guard. Os 7 dias são o prazo de acesso; a copy
   virou promessa de resultado, em nome de uma psicóloga.

## Mudança

### A. Urgência condicionada à oferta

- `ofertaTemUrgenciaConfirmada(texto)` (pura, em `creativeScoringEngine.ts`):
  procura no texto confirmado pelo cliente (`facts.confirmedClaimsRaw`) só
  condição que ACABA: "até o dia", "válido até", "só até", "por tempo
  limitado", últimas vagas/unidades, vagas limitadas, promoção/desconto/
  inscrições/matrículas seguidos de "até/encerra/termina", "encerra(m) na
  sexta/amanhã/dia…", Black Friday, cupom, pré-venda, feirão, lote numerado,
  data dd/mm (não "24/7"). Palavra solta não conta ("sem prazo", "lote de
  360m²", "lançamento", "bônus de material", "inscrições abertas", "desconto
  à vista").
- `aplicarFlagDeUrgencia(criativos, confirmedClaimsRaw | undefined)` (pura)
  grava `urgencyApplicable` em cada criativo em
  `enrichCreativesWithScoresAndImages`. Sem `campaignFacts` (regeneração
  parcial, `ai.ts` ~9451), o flag é REMOVIDO, nunca herdado do JSON do modelo.
- `scoreCreative`: com `urgencyApplicable === false`, a urgência entra com
  valor NEUTRO 60 (nem pune nem premia) e não gera recomendação de urgência.
  Tirar a urgência da conta (primeira versão) afrouxava o portão: card só com
  campos no tamanho certo e sem dado concreto chegava a 75. Ausente/`true` =
  comportamento atual. O campo `urgency` continua calculado e exposto.
- A recomendação de especificidade deixa de pedir "prazo" (sempre): pedia
  prazo e empurrava o modelo a inventar.
- O flag vai no JSON do criativo: toda repontuação posterior (tela, chat,
  MCP, `creativeReview`) usa o mesmo critério. Limite conhecido: o flag é
  decidido na geração; se o briefing ganhar uma promoção depois, é preciso
  gerar de novo. Campanhas já salvas (806, 810, 811) não ganham o flag.

### B. Fact Guard: resultado com prazo

- `detectTimeboundResultClaims` em `campaignFactGuard.ts`, regra estrutural,
  qualquer nicho, conflito `unverified_timebound_result_claim`.
- Três padrões (flag `u`, `\p{L}` no lugar de `\b`): resultado → prazo
  (janela 60, sem atravessar `, ; : . ! ?`), prazo → resultado (janela 40) e
  "N dias para <resultado>". Prazo aceita modificador ("em apenas", "em menos
  de", "em até"), número por extenso, "poucos dias" e "48h"; não aceita
  "dias úteis".
- Raízes: transform-, mude/muda/mudar, result-, resolv-, supere/superar,
  cura/curar, emagre-, melhore/melhorar (não "melhores"), evolu-, conquist-,
  domine/dominar, libert-, vença, perca/perder, elimin-, fatur-, ganhe/ganhar,
  aprenda/aprender, fluente.
- Não é promessa quando o trecho ou até 30 caracteres antes, na mesma oração,
  tem termo comercial ou de serviço: parcela, pague, financiamento, entrada,
  juros, à vista, boleto, cartão, mensalidade, frete, entrega, exame,
  atendimento, úteis, acesso, liberado, garantia de, devolução, reembolso,
  troca.
- Passa se o cliente afirmou promessa com o MESMO prazo no briefing/perfil,
  mesmo com outras palavras (`alegacaoComPrazoConfirmada`).
- Barra também, de propósito, promessa de prazo não confirmada de outros
  nichos ("perca 10 kg em 2 meses", "fature R$ 10 mil em 30 dias").
- Atenção: a regra vale também na publicação de rascunhos já salvos
  (`campaignPublishIntegrity.ts`). Rascunho antigo com esse tipo de frase
  passa a ser recusado até a frase ser trocada.

## Versão final (reduzida)

1. **Urgência:** com `urgencyApplicable === false`, a urgência na nota é
   `max(calculada, 60)`. Promoção real que o detector não reconhece mantém o
   valor calculado (até 100); oferta sem condição sobe da base 25 para 60.
   Sem recomendação de urgência nesse caso. Trade-off aceito: card fraco em
   urgência ganha até 7 pontos na nota (0,2 × 35); a rodada 2 mostrou card
   genérico com gancho forte chegando a 77.
2. **Promessa de resultado com prazo:** sai de `validateCampaignFactIntegrity`
   (não derruba geração nem publicação). Vira motivo `promessa_com_prazo` em
   `diagnosticarRevisao` (`creativeReview.ts`), **liberável por aprovação**
   junto com `score_baixo` (tela, chat, MCP e pré-checagem de publicação usam
   a mesma função). Na geração, criativo com promessa recebe `needsReview:
   true` e `promessasComPrazo`. Aprovação grava `reviewApprovalReason` com os
   motivos. Descrições das ferramentas do chat e do MCP atualizadas.
   Falso positivo custa um clique de aprovação; falso negativo é igual a hoje.
3. Detector ampliado com os falsos negativos da rodada 2 ("Em 7 dias,
   transforme", "7 dias que vão mudar", "pele renovada", "acabe com",
   "livre da", "recupere", "destrave", "quebre", "sinta a diferença", "nova
   versão", "perfeito", "chapada", "seque").
4. Recomendação de especificidade sem "prazo" e `aplicarFlagDeUrgencia`
   (remove flag sem fatos) continuam.
5. Testes: `test:creative-review` (novo script, inclui
   `campaignDraftEdit` e `chatCreativeEdit`), `test:fact-guard`,
   `test:creative-scoring`.

## Arquivos

- `server/creativeScoringEngine.ts`, `server/campaignFactGuard.ts`,
  `server/creativeReview.ts`, `server/ai.ts` (flag de urgência e marcação de
  promessa em `enrichCreativesWithScoresAndImages`), `server/chat.ts` e
  `server/mcpServer.ts` (só textos de descrição), `package.json`
- Testes em `server/__tests__/creativeScoringEngine.test.ts` e
  `server/__tests__/campaignFactGuard.test.ts`

## Fora do escopo

- Lista `URGENCY_TERMS` (palavra vazia como "agora" segue contando quando a
  urgência se aplica).
- Stop slop ("transforme", "descubra seu potencial") no score.
- Achado lateral, não corrigido: `server/ai.ts` ~3327 (`extractAndSavePatterns`)
  tem um caractere de controle backspace literal dentro de uma regex
  (`/<BS>\d{4,}<BS>/g`), então números de 4+ dígitos nunca viram `{numero}`
  no template. Corrigir troca comportamento de templates (risco de
  `{numero}` sem preencher); fica para outra mudança.

## Portas afetadas

Tela, chat e MCP: mesma nota para o mesmo criativo, via flag no JSON.

## Dados

Sem tabela nem migração. Campo novo `urgencyApplicable` dentro do JSON de
cada criativo (coluna `campaigns.creatives`, texto). Fact Guard ganha um
motivo novo de conflito.

## Como provar

- Score: com `false`, nota = fórmula renormalizada, sem recomendação de
  urgência e maior que com urgência; ausente e `true` iguais a hoje;
  `ofertaTemUrgenciaConfirmada` falso para a oferta da Shadia, verdadeiro para
  desconto com data, inscrições até dd/mm, promoção, lote.
- Fact Guard: bloqueia as duas frases reais da 811 e variações; não acusa
  prazo de acesso, módulos, frase sem prazo; passa quando o cliente afirmou.
- Produção: gerar rascunho do projeto 49 e conferir `urgencyApplicable:false`,
  notas e ausência de "em 7 dias" como resultado.

## Revisão Goldfish

| Rodada | Fase | Bloqueantes | Riscos | Resultado |
|---|---|---|---|---|
| 1 | Especificação + diff | 2 (parcelamento barrado: "entrada parcelada em 60 meses"; "em apenas 7 dias" passava) | 14 | Corrigidos: termo comercial anula a regra (no trecho e 30 caracteres antes), modificador/48h/poucos dias/"N dias para", raízes novas, "melhores" excluído, janela não atravessa vírgula, "dias úteis" fora; confirmação pelo mesmo prazo; urgência neutra 60 em vez de sair da conta (portão não afrouxa, com teste); detector de urgência só aceita condição que acaba (falsos positivos testados); recomendação sem "prazo"; flag removido quando não há fatos; teste por raiz e mutações conferidas. Aceitos: flag decidido na geração; perfil antigo pode manter urgência; campanhas salvas sem flag. |
| 2 | Diff | 3 (promoção real não reconhecida perdia nota; card genérico passava de 75; frase confirmada pelo cliente barrada inclusive na publicação) | 7 | Parado pela regra de 2 rodadas e levado ao Michel, que escolheu a versão reduzida: urgência com piso 60 (max), promessa com prazo como alerta liberável, detector ampliado. |
| 3 | Diff da versão reduzida | 1 (editar pela tela nunca voltava a marcar: promessa digitada na tela publicava sem aprovação) | 6 | Corrigido: tela marca e desmarca como o chat e perde a aprovação anterior ao editar texto com motivo. Também: regeneração de criativos usa os fatos salvos da campanha só para urgência e promessa (sem ligar o Fact Guard); marcação extraída para `marcarPromessasParaRevisao` com teste; aprovação mostra hook e as frases da promessa em tela, chat e pré-checagem; mensagens que diziam "só score" corrigidas; distância ("em 5 minutos do centro") e desconto/pedido/feira fora do detector; teste para cada raiz nova (antes faltava, a edição do teste não tinha sido aplicada). Aceitos: `promessasComPrazo` gravado na geração não é atualizado em edição; motivo da aprovação calculado sem fatos. |
