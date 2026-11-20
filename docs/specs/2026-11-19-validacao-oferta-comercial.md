# Validação da oferta comercial e confirmação de publicação

## Problema

O Fact Guard só valida preço. Medido em 19/11 numa oferta de uma aula por
R$ 19,90 com 7 dias de acesso (campanha 799): "Aula grátis", "Aula gratuita",
"Participe sem pagar nada", "50% de desconto", "Acesso por 30 dias" e "bônus
grátis de e-book" passavam (6 de 12 casos). Só "R$ 0", "De R$ 97 por R$ 19,90"
e "R$ 29,90" eram barrados (pela regra de preço).

A origem está nos produtores: `shared/segmentConfig.ts` e `server/ai.ts`
(`SEGMENT_COPY_RULES`, `getSegmentInstruction`) mandam a IA usar CTAs como
"Aula grátis" e "Avaliação gratuita" para o objetivo leads, e o prompt dizia
"leads: material gratuito". Leads não autoriza presumir oferta gratuita.

Na publicação, `publishToMeta` valida os criativos salvos, mas o texto que vai à
Meta (título, texto, descrição) é reescrito DEPOIS (dedupe, deslopify, persona do
conjunto, correção da auditoria, descrição padrão "Condições especiais hoje" para
vendas). A versão enviada não era a versão validada. A rota da tela não tinha
trava de duplicidade; o MCP não exigia confirmação explícita.

## Mudança

1. Guarda de oferta (`campaignOfferGuard.ts`), ligado a `validateCampaignFactIntegrity`,
   para qualquer cliente e objetivo. Compara o texto com `confirmedClaimsRaw`
   (briefing + perfil, normalizado):
   - gratuidade: grátis, gratuito, sem custo, de graça, sem pagar nada, não pague
     nada, R$ 0, custo zero. Só passa se o briefing afirma a gratuidade do MESMO
     sujeito (janela de 18 caracteres). Preço positivo confirmado nunca autoriza
     "grátis" para o produto. Negação ("não é grátis") não é promessa.
   - desconto: N% off/desconto, "de R$ X por R$ Y" (X precisa estar confirmado),
     economize, promoção, cupom, condições especiais.
   - bônus/brinde: exige a palavra no briefing e, quando há item citado, o item.
   - prazo de acesso e garantia: mesma duração confirmada (1 semana = 7 dias).
   - prazo da oferta: data limite e urgência (só hoje, últimas horas).
2. Cada conflito traz trecho, motivo e `suggestion` (troca baseada em fato
   confirmado ou remoção) ou `needsOfferConfirmation` quando falta fato.
3. Campos de texto ampliados em `collectTextFields` (título/subtítulo/corpo de
   cartão, narração, legenda, CTA).
4. Produtores: CTAs sugeridos que prometem algo não confirmado são descartados
   (`ctasSemPromessaNaoConfirmada`), regra de oferta no prompt, descrição padrão
   de vendas trocada por "Conheça a oferta".
5. Pré-voo (`publishPreflight`): nova pendência `oferta_divergente` com
   `divergencias` (campo, trecho, motivo, sugestão, texto atual). Alimenta tela,
   chat e MCP.
6. `campaigns.resolveOfferDivergence`: aplica a sugestão (recalculada no
   servidor) ou um texto manual e SÓ salva o rascunho. Não aprova revisão, não
   publica, não fala com a Meta.
7. Revalidação do texto final: `assertOutgoingMetaTexts` valida título, texto,
   descrição e CTA após auditoria, ANTES de qualquer escrita na Meta, e o corpo
   inteiro do criativo (carrossel, criativo dinâmico, vídeo) logo antes de
   `/adcreatives`.
8. Duplicidade na tela/chat/MCP: `publishToMeta` reserva `ui_meta_publish`
   (campanha + conjunto + página) antes de gravar status; clique duplo recebe o
   resultado da primeira ou recusa enquanto roda; falha libera a reserva.
9. MCP `publish_campaign`: valida (pré-voo) e devolve `confirmationToken`; só o
   segundo envio com o token cria a campanha pausada. O token depende do estado
   da campanha.

## Arquivos

`server/campaignOfferGuard.ts` (novo), `server/campaignFactGuard.ts`,
`server/campaignPublishIntegrity.ts`, `server/publishPreflight.ts`,
`server/offerDivergenceFix.ts` (novo), `server/metaOutgoingTextGuard.ts` (novo),
`server/_core/router.ts`, `server/mcpServer.ts`, `server/ai.ts`,
`client/src/components/OfertaDivergenciaCard.tsx` (novo),
`client/src/pages/CampaignResult.tsx`, testes
`campaignOfferGuard.test.ts` e `offerPublishFlow.test.ts`.

## Fora do escopo

- Prova semântica: parafrases raras, ironia, texto dentro de imagem e vídeo.
- Copy estática de fallback em `ai.ts` (ex.: escritório de advocacia "Primeira
  consulta grátis"): continua sendo barrada pelo guard, não reescrita.
- Campanhas já publicadas e a limpeza de campanhas pausadas órfãs na Meta.
- Qualquer alteração em campanhas reais (799 e 814 só como referência).

## Portas afetadas

- Tela: pré-voo mostra divergências com ação; `publishToMeta` revalida e trava
  duplicidade. Fechar o modal não altera o rascunho.
- Chat: a pendência bloqueia antes do token; a confirmação exata e a reserva
  `chat_meta_publish` seguem como estavam; as chamadas internas também passam
  pela reserva por conjunto.
- MCP: pré-voo e token antes de reservar a `idempotencyKey`.

## Dados

Nenhuma tabela nem coluna. Reaproveita `mcp_idempotency_keys` com
`toolName = ui_meta_publish`.

## Como provar

`node --import tsx --test server/__tests__/campaignOfferGuard.test.ts
server/__tests__/offerPublishFlow.test.ts` (os testes falham com a regra
removida: a avaliação sem ela errou 6 de 12). Em produção, depois do deploy:
abrir o modal de publicar de uma campanha com "grátis" no rascunho (sem salvar
nada) e ver a divergência com campo e trecho; aplicar a sugestão e ver só o
rascunho mudar.

## Revisão Goldfish

| Rodada | Fase | Bloqueantes | Riscos | Resultado |
|---|---|---|---|---|
| 1 | diff | 3 (todos corrigidos com teste: "30 reais" casava "0 reais"; negação não cortada por vírgula; gate de saída barrava texto de sistema do carrossel depois de criar campanha na Meta) | 7 (falsos positivos "sem custo adicional" e "até sábado", "valida até", NFD, edição manual só em campos de copy corrigidos; reserva sem expiração, token MCP só barreira de instrução, "free"/"sem mensalidade" ficam como limite) | corrigido |
