# Isolamento entre clientes: rotas restantes

Continuação de `2026-11-23-isolamento-e-orcamento-dos-conjuntos.md` (branch
`fix/isolamento-e-orcamento-dos-conjuntos`, ainda sem merge). Esta branch
(`fix/isolamento-rotas-restantes`) parte dela.

## Problema

Depois do middleware de `campaignId`/`projectId`, a varredura de todas as
rotas `protectedProcedure` (router.ts e `*Router.ts`) e de todas as rotas
Express encontrou estas brechas, por leitura de código:

| Rota | Falha |
|---|---|
| `competitors.delete` (`id`), `competitors.update` (`id`) | apaga/altera concorrente de qualquer cliente |
| `competitors.estimateSpend`, `analyze`, `reanalyze`, `fetchTikTokCompetitor`, `analyzeAdInput`, `analyzeTikTok`, `fetchAdsByPageId`, `integrations.submitClientAds` (`competitorId`) | lê/apaga anúncios coletados do concorrente de outro cliente (o `projectId` da entrada era conferido, o concorrente não) |
| `notifications.markRead` (`id`) | marca como lida a notificação de qualquer usuário |
| `subscriptions.getCheckoutPix` (`subId`) | devolve valor, QR e código Pix da assinatura Asaas de qualquer usuário |
| `vsl.jobStatus`, `vsl.deleteJob` (`jobId`) | consulta/apaga job de vídeo de outro usuário; o id é previsível (`mecpro_<userId>_<timestamp>`) |
| Express `GET /api/campaigns/:id` | qualquer usuário logado lê nome, nicho e produto de qualquer campanha |
| Express `GET /api/diag/meta` | lista email, nome, conta de anúncios e início do token Meta de TODOS os clientes; a chave padrão `mecpro-diag-2026` está no código e no bundle do navegador (`AutonomousAgent.tsx`) e vale quando `DEBUG_TOKEN` não está definido |
| Express `GET /api/competitors/status` | sem checagem de dono (hoje inerte: lê `payload.sub`, que o token de sessão não tem) |
| Express `GET /api/webhook/asaas/status` | sem autenticação nenhuma; devolve depósitos e saldo de mídia de todos os clientes (achado da revisão Goldfish) |
| Express `POST /api/marketplace/order` | sem autenticação; grava pedido "pago" no anúncio de qualquer vendedor e soma conversões; nenhum cliente do sistema chama a rota (achado da revisão Goldfish) |

Conferidas e já protegidas (não mexidas): chat (sessões, fotos), MCP, API
pública (`/api/v1`), marketplace (`listing.userId`), comentários
(`"userId" = $2`), chaves de API, fine-tuning (`assertOwnsExample`), vendas
(`assertOwnsProject`), recargas de mídia, `/api/campaigns/latest` (SQL com
`p."userId"`), rotas de Meta/Google/TikTok por id da plataforma (usam o token
do próprio usuário; a plataforma recusa recurso alheio), uploads Meta (token
do próprio usuário).

## Mudança

- `server/ownership.ts`: o middleware também confere `competitorId` numérico
  (concorrente de projeto do usuário; com `projectId` junto, tem de ser o
  projeto dele). `assertCompetitorOwner` para rotas por `id`. Admin passa,
  como no middleware existente. Store sem `getCompetitorById` fecha.
- `notifications.markRead` usa `db.markNotificationReadForUser(id, userId)`.
- `getCheckoutPix`: busca a assinatura no Asaas e só segue se o
  `externalReference` for um dos formatos que o MecProAI grava para o próprio
  usuário (`server/asaasOwnership.ts`); senão devolve `null`, como já faz
  quando não acha pagamento.
- `vsl.jobStatus`/`deleteJob`: o `jobId` tem de começar com `mecpro_<userId>_`.
- `/api/campaigns/:id` e `/api/competitors/status`: mesma checagem de dono,
  com o usuário que cada rota já identifica pelo token.
- `/api/diag/meta`: sessão de admin/superadmin, ou `DEBUG_TOKEN` definido
  explicitamente no ambiente (e diferente da chave padrão).
- `/api/webhook/asaas/status`: só sessão de admin/superadmin (helper
  `sessaoDeAdmin`, o mesmo usado em `/api/diag/meta`). Resposta igual para admin.
- `POST /api/marketplace/order`: 401 sem sessão, 403 se não for admin. Até
  existir um checkout com webhook assinado, ninguém além do admin grava pedido.

## Arquivos

`server/ownership.ts`, novo `server/asaasOwnership.ts`, `server/_core/router.ts`,
`server/_core/vslRouter.ts`, `server/_core/index.ts`, `server/marketplace.ts`, `server/db.ts`, teste novo
`server/__tests__/isolamentoRotasRestantes.test.ts`.

## Fora do escopo

- `/api/health/ai`: aceita a mesma chave padrão pública para rodar o teste
  completo de provedores (gasta cota de IA). Não expõe dado de cliente.
- `/api/campaigns/latest` e `/api/competitors/status` leem `payload.sub`, que o
  token de sessão não tem: as duas rotas hoje não funcionam. Não corrigido
  (mudaria comportamento); registrado.
- Rotas Express de admin com `ADMIN_SECRET || JWT_SECRET`: segredo do
  servidor, não de cliente.

## Portas afetadas

Tela: as rotas acima passam a responder "não encontrado"/`null` para recurso
alheio; o próprio usuário não percebe diferença. Chat e MCP: inalterados.

## Dados

Nenhuma migração. Uma consulta a mais por chamada com `competitorId`; uma
chamada a mais ao Asaas em `getCheckoutPix`.

## Como provar

`server/__tests__/isolamentoRotasRestantes.test.ts` (15 testes): unidade do
middleware e das funções puras, roteador tRPC de teste, e checagem de fonte de
cada rota corrigida. Com as rotas revertidas os testes de fonte falham
(conferido: 5 na primeira leva, 3 na segunda). Suíte completa 946/946; `tsc`
43/64, igual à base.

## Revisão Goldfish
| Rodada | Fase | Bloqueantes | Riscos | Resultado |
|---|---|---|---|---|
| 1 | diff | 2 (`/api/webhook/asaas/status` aberto; `POST /api/marketplace/order` aberto) | serviço VSL com segredo padrão e `GET /jobs` sem filtro; `/api/health/ai` com chave pública; ligação do middleware só testada pela fonte; formatos de referência Asaas duplicados em `asaasOwnership` e `interpretarReferencia` | 2 bloqueantes corrigidos nesta branch; riscos registrados para o Michel |
