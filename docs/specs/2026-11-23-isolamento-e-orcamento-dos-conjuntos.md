# Isolamento entre clientes e orçamento dos conjuntos

## Problema

Três falhas ativas no commit `486ecae` (deploy no ar desde 20/11):

1. **Rotas tRPC sem checagem de dono.** Qualquer usuário logado lê, altera ou
   apaga dado de outro cliente informando um número:
   - `campaigns.get` (`server/_core/router.ts:2839`) devolve qualquer campanha
     por id; `db.getCampaignById` (`server/db.ts:251`) não filtra por dono.
   - `campaigns.list` (2769) lista as campanhas de qualquer `projectId`;
     `campaigns.create` (2840) cria campanha em projeto alheio.
   - `campaigns.updateAdSet` (3373), `updateCreativeImage` (3041),
     `setFeaturedPhoto` (3134), `enhanceCreativeImage` (3329), `regeneratePart`
     (3397) gravam em campanha alheia.
   - `projects.get`/`update`/`delete` (1025 a 1040), `clientProfile.get`/
     `upsert`/`autoFill` (1045 a 1275), `competitors.*` com `projectId`,
     `market.*` (2758), `matchScore` (2845) e outras rotas listadas pelo
     script de varredura (ver "Como provar").
   - `publishToMeta` confere o dono da campanha, mas usa `input.projectId`
     para ler o perfil do cliente sem conferir que é o projeto da campanha.
   As portas MCP (`mcpServer.ts`) e chat (`chatAdsTools.ts`) já conferem
   `project.userId !== userId`; a falha é da porta tela (tRPC).

2. **Soma dos conjuntos não é conferida.** A publicação calcula o orçamento de
   cada conjunto pelo texto (`router.ts` ~4669 a 4726): percentual vence o
   valor em reais, número puro acima de 100 vira mensal ÷ 30, e conjunto abaixo
   de R$ 6 é elevado a R$ 6 em silêncio. Nada compara a soma com o diário
   aprovado (`suggestedBudgetDaily`). Casos reais no banco:
   - 816 (20/11, rascunho): "2000 | 1500 | 1500" → ~R$ 167/dia contra R$ 6.
   - 814 (14/11, publicada): "R$ 42/dia (50% do total)" × 2 com R$ 6 aprovado
     → R$ 3 cada, elevado a R$ 6 → R$ 12/dia.
   - 795: "R$ 40/dia (100%)" com R$ 90; 799: R$ 6 + 2 + 2 contra R$ 6.
   A validação antecipada (~4355 a 4390) usa um parser diferente do cálculo
   real ("R$ 42/dia (50%)" vira 42 nela e 3 no cálculo).

3. **"Mensal" com três significados.** A coluna `suggestedBudgetMonthly`
   guarda o total do período na geração (`ai.ts` ~6825: diário = total ÷
   duração). O construtor (`CampaignBuilder.tsx` ~671) chama de "Orçamento
   mensal" e estima diário = valor ÷ 30. `update_live_meta_campaign`
   (`mcpServer.ts` ~2714) grava diário × 30. A tela de resultado
   (`CampaignResult.tsx` ~2355) mostra "Budget mensal". Fallbacks em
   `router.ts` (4357, 4670), `CampaignResult.tsx` (1017, 1105),
   `PublishValidator.tsx` (153) e `autonomousAgent.ts` (194, 339) dividem ou
   multiplicam por 30.

## Mudança

1. **Dono conferido num lugar só.** O `protectedProcedure` de `router.ts` e o
   de `_core/trpc.ts` ganham uma checagem: quando a entrada traz `campaignId`
   ou `projectId` numérico inteiro positivo, a campanha/projeto tem de ser do
   usuário (`projects.userId`). Se trouxer os dois, a campanha tem de ser
   daquele projeto. Falha → `NOT_FOUND` ("não encontrada"), igual para "não
   existe" e "é de outro", para não revelar existência. `campaignId` string
   (id da Meta/Google/TikTok) e valor 0 são ignorados. Rotas cujo id vem como
   `id` (`campaigns.get`, `projects.get/update/delete`) recebem checagem
   explícita. `adminProcedure`/`superadminProcedure` não mudam. Decisão:
   usuário com papel admin/superadmin **fica fora** da checagem, para manter o
   acesso administrativo que já existe pelas rotas de admin (uma conta admin
   comprometida já lê tudo por elas; a checagem não muda esse risco).
   A entrada é lida com `getRawInput()` (tRPC v11: o middleware roda antes do
   `.input()`). Banco indisponível: `getProjectById`/`getCampaignById` devolvem
   null → NOT_FOUND (fecha, não abre). `campaigns.get` e `projects.get`
   continuam devolvendo `null` para "não encontrado" (contrato das telas).
2. **Plano de orçamento único.** Uma função pura
   (`shared/adSetBudgetPlan.ts`) calcula, para todos os conjuntos do rascunho,
   o diário de cada um exatamente como a publicação manda para a Meta (mesmas
   regras de texto de hoje: percentual do aprovado, "R$ X/dia" explícito,
   "R$ X" sem /dia e número acima de 100 como mensal ÷ 30, piso de R$ 6 que
   eleva percentual e recusa diário explícito), mais o diário aprovado e a
   soma. Também é erro do conjunto o texto mostrar um valor em reais diferente
   do que o percentual dá (795: "R$ 40/dia (100%)" com R$ 90 aprovado publica
   R$ 90). A validação antecipada antiga (outro parser, mínimo 5,11) sai; o
   aviso do `update_campaign_draft` passa a usar o mesmo piso de R$ 6.
   Diário aprovado = `suggestedBudgetDaily`; sem ele, total do período ÷
   `durationDays` (30 se ausente). Divergência = |soma − aprovado| maior que
   R$ 0,50 × nº de conjuntos (arredondamento por conjunto).
   - `publishToMeta` usa essa função para o valor de cada conjunto (sem
     mudança de valor quando o plano bate) e **recusa** a publicação quando a
     soma diverge, listando cada conjunto, o valor calculado, se foi elevado ao
     piso, a soma e o aprovado, e o que fazer.
   - `pendenciasLocaisParaPublicar` ganha a pendência `orcamento_divergente`
     (ação `ajustar_orcamento`): a tela (pré-checagem), o chat e o MCP mostram
     antes do token de confirmação.
   - O plano considera o rascunho inteiro, não só os conjuntos selecionados:
     publicar parte dos conjuntos de um plano coerente continua permitido.
   - Saída explícita "usar a soma dos conjuntos como orçamento aprovado"
     (`somaComoAprovado`): só rascunho (sem `metaCampaignId`), sem conjunto
     inválido, só por pedido do usuário. Tela: botão na pendência
     (`campaigns.approveAdSetBudgetSum`). Chat: `atualizar_orcamento_campanha`
     com `usarSomaDosConjuntosComoAprovado`. MCP: `update_campaign_draft`
     (`suggestedBudgetDaily`/`suggestedBudgetMonthly`), que já existia.
3. **Total do período.** Sem migração: a coluna continua `suggestedBudgetMonthly`
   e passa a significar só "total do período" em todo o código.
   - Construtor: título "Orçamento total do período", estimativa diária = valor
     ÷ duração escolhida, rótulos sem "/mês".
   - Telas exibem o total como diário aprovado × dias
     (`totalDoPeriodoDaCampanha`), não a coluna: em 23/11, 308 de 707
     campanhas tinham a coluna diferente de diário × dias (205 gravadas como
     diário × 30 com outra duração). Sem migração; as linhas antigas ficam.
   - Resultado: "Total do período" com "R$ X/dia × N dias"; planejamento
     semanal "no período".
   - `update_live_meta_campaign`: só reescreve o aprovado quando a campanha tem
     um conjunto (diário × dias); com vários, não mexe e avisa.
   - Fallbacks ÷ 30 trocados por ÷ dias: `CampaignResult` (pré-checagens e
     planejamento), criadores Google e TikTok, `autonomousAgent`,
     `PublishValidator`; prompt de `generateCampaignPart` (regenerar conjuntos)
     deixa de dizer "Budget mensal" e diz o diário aprovado que os conjuntos
     devem somar.
   - Dashboard e Financeiro dividiam o diário por 100 (tratavam reais como
     centavos: R$ 6 virava R$ 0,06); corrigido, rótulo "Total dos períodos".

## Arquivos

- `server/_core/router.ts`, `server/_core/trpc.ts`, novo `server/ownership.ts`
- novo `shared/adSetBudgetPlan.ts`; `server/publishPreflight.ts`
- `server/mcpServer.ts` (só `update_live_meta_campaign`), `server/autonomousAgent.ts`
- `client/src/pages/CampaignBuilder.tsx`, `client/src/pages/CampaignResult.tsx`,
  `client/src/components/PublishValidator.tsx`
- testes novos em `server/__tests__/`

## Fora do escopo

- Rotas com ids de outros recursos (`competitors.delete` por id de
  concorrente, `notifications.markRead`, `estimateSpend` por `competitorId`):
  mesma classe de falha, recurso diferente; listadas no relatório para a
  próxima rodada.
- Renomear a coluna no banco (exige migração).
- Mudar a geração para não produzir conjuntos incoerentes (o portão bloqueia;
  a causa no prompt fica para depois).
- Campanhas já publicadas: nada é alterado na Meta.
- Publicação parcial seguida de edição (conjunto 0 publicado, 1 falha, rascunho
  editado): o plano confere o rascunho, não o que já está na Meta;
  `updateAdSet` não recusa campanha publicada. Risco registrado.
- Rótulo "Orçamento mensal" do perfil do cliente (`monthlyBudget`): é mensal
  de verdade, não muda.

## Portas afetadas

- Tela: pré-checagem mostra "orçamento dos conjuntos não bate"; o botão
  publicar recusa com a lista. Saída: editar o orçamento do conjunto
  (`campaigns.updateAdSet`) ou o diário aprovado.
- Chat: `publicar_campanha` recusa antes do token pela pendência; saída
  `atualizar_orcamento_campanha`.
- MCP: `publish_campaign` recusa pela pré-checagem; saída
  `update_campaign_draft` (`adSetBudgetsDaily`, `suggestedBudgetDaily`).
- Isolamento: só a tela muda (chat e MCP já conferem).

## Dados

Nenhuma tabela ou coluna nova; nenhuma migração. Leitura extra por chamada
tRPC com `campaignId`/`projectId` (uma consulta indexada por chave primária).

## Como provar

- Teste do middleware: usuário B recebe NOT_FOUND em `campaigns.get`,
  `campaigns.list`, `campaigns.updateAdSet`, `projects.delete` com ids de A;
  A continua acessando; `campaignId` string passa; campanha de A com projeto
  de B recusa.
- Teste do plano com as formas reais de 795, 799, 814 e 816 (divergem) e 819,
  817, 804 (batem); falha se a correção for revertida.
- Teste de fonte: `publishToMeta` usa o plano (sem segundo cálculo inline).
- Suíte completa e `tsc` comparados com `486ecae` (base: servidor 43, total 64).
- Produção: nada até autorização do Michel.

## Revisão Goldfish
| Rodada | Fase | Bloqueantes | Riscos | Resultado |
|---|---|---|---|---|
| 1 | Especificação | 1 (A7: tela sem saída quando aprovado < R$ 6 × conjuntos) | 8 | Corrigido: saída `approveAdSetBudgetSum`/chat/MCP; divisores, piso, admin, banco fora, contrato de `get`, fallbacks ÷30 e linhas antigas descritos acima |
