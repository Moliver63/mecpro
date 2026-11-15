# Ativação de plano por pagamento Asaas + `purchase` no GA4

## Problema

Achados em produção e no código (15/11):

- Gateway ativo: `app_settings.payment_gateway = 'asaas'` (banco de produção
  `mecpro-db-copy`).
- `AsaasProvider.createSubscription` (`server/paymentService.ts`) cria a
  assinatura com `externalReference: user_<id>_<plano>`. No cartão, a cobrança
  é imediata. Nenhum código ativa o plano depois.
- `/api/webhook/asaas` (`server/_core/index.ts`) só trata depósito de verba
  (`media_budget` pendente). Pagamento de assinatura cai em "Depósito não
  encontrado" e é ignorado.
- Plano anual (`subscriptions.createAsaasAnnual`, referência
  `mecpro_annual_uid_<id>_<plano>`) entra em `media_budget` com
  `category='annual_plan'`: o webhook credita o saldo, mas não muda
  `users.plan`.
- A tabela `subscriptions` do fluxo Stripe não existe em produção.
- Nenhum evento do webhook Asaas nos logs dos últimos 30 dias.

Resultado: quem paga pelo Asaas continua no plano free, a menos que alguém
ative à mão.

## Mudança

`server/asaasPlanPayments.ts` (novo):

- `processarPagamentoDePlano(paymentId)`:
  1. Busca o pagamento na **API do Asaas** (`GET /v3/payments/{id}`) com
     `ASAAS_API_KEY`. O corpo do webhook nunca é usado como prova.
  2. Só segue se: status `RECEIVED`, `CONFIRMED` ou `RECEIVED_IN_CASH`;
     referência `user_<id>_<plano>` ou `mecpro_annual_uid_<id>_<plano>`;
     valor igual a um preço válido do plano (mensal 97/197/397 ou anual
     924/1884/3804, mesma tabela do `paymentService` e do
     `createAsaasAnnual`, travada em teste).
  3. `INSERT ... ON CONFLICT ("paymentId") DO NOTHING` em `payment_events`:
     webhook duplicado (cartão manda CONFIRMED e RECEIVED) ou paralelo não
     ativa duas vezes. Se a ativação anterior falhou no meio (linha sem
     `planActivatedAt`), tenta de novo.
  4. `db.updateUserPlan(userId, plano)` e marca `planActivatedAt`.
  5. `purchase` no GA4 (Measurement Protocol) só na **primeira** ativação
     paga do usuário, `transaction_id` = id do pagamento, `currency: BRL`,
     trava atômica em `gaPurchaseNote`. Precisa do `client_id` do GA gravado
     no checkout; sem ele, ativa o plano e registra o motivo, sem enviar.
     Sem `GA4_API_SECRET`, registra `sem_GA4_API_SECRET`.
- Webhook: chama o processamento quando o pagamento não é depósito pendente,
  e depois do crédito do plano anual. Erro no processamento responde **500**
  para o Asaas reenviar (com 200 ele não reenvia e o cliente que pagou ficava
  no free). No anual, o reenvio encontra o depósito já `approved` e só ativa
  o plano, sem creditar de novo.
- **Fail-closed:** sem `ASAAS_WEBHOOK_TOKEN` configurado, a ativação
  automática não roda (log de aviso). Sem token, qualquer um poderia reenviar
  o id de um pagamento antigo e reativar plano rebaixado.
- **Ativar nunca rebaixa:** o plano final é o maior entre o atual e o pago
  (renovação de assinatura menor não derruba VIP dado pelo admin nem upgrade).
- Valor confere com `value` ou `originalValue` (pagamento com juros/multa).
- Estorno/chargeback de pagamento que ativou plano gera log de erro
  "ESTORNO ... rebaixar manualmente".
- Resposta do webhook não expõe `userId` nem plano.

Checkout (`subscriptions.createCheckout` e `createAsaasAnnual`): aceitam
`ga: { clientId, sessionId? }` opcional, lido dos cookies `_ga` e
`_ga_JJ1H7MV9B7` no navegador (`shared/gaCookies.ts`), e gravam em
`checkout_attribution` pela referência do Asaas (id da assinatura ou do
pagamento anual). Falha aqui não derruba o checkout.

## Dados

Migração aditiva no boot (`server/_core/migrations.ts`, `CREATE TABLE IF NOT
EXISTS`): `payment_events` e `checkout_attribution`. Nenhuma coluna existente
muda. Sem `drizzle-kit push`.

## Configuração (Michel)

- Render: `GA4_API_SECRET` (GA4 > Admin > Fluxos de dados > Web > Chaves
  secretas da API do Measurement Protocol). Opcional `GA4_MEASUREMENT_ID`
  (padrão `G-JJ1H7MV9B7`).
- Asaas: webhook apontando para `https://www.mecproai.com/api/webhook/asaas`
  com os eventos `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED`, e o mesmo token
  em `ASAAS_WEBHOOK_TOKEN` no Render.
- GA4: marcar `purchase` como evento-chave.

## Fora do escopo (pendências registradas)

- **Rebaixar plano** quando a assinatura atrasa, é cancelada ou estornada
  (`PAYMENT_OVERDUE`, `SUBSCRIPTION_DELETED`, `PAYMENT_REFUNDED`). Com esta
  mudança, um pagamento ativa o plano até alguém mudar à mão. Diferente da
  ativação manual, ninguém vê cada venda: o estorno pelo menos gera alerta no
  log. **Próxima prioridade.**
- Cancelar a assinatura Asaas antiga no upgrade (hoje as duas cobram).
- **Comissão de parceiros** pelo Asaas: `recordCommissionFromInvoice`
  (`server/affiliates.ts`) só roda no Stripe. Plano anual mistura mensalidade
  e crédito de anúncio, então a base da comissão é decisão de negócio.
- Unificar a tabela de preços em um só lugar (hoje em três).

## Riscos aceitos

- `purchase` sem `client_id` (bloqueador, checkout sem cookie) não é enviado:
  o plano ativa igual e o motivo fica em `payment_events.gaPurchaseNote`.
- Mudança de preço sem atualizar a tabela deste módulo faz o pagamento não
  ativar (fica registrado no log como `valor_nao_confere`). Falha segura.

## Como provar

- `npm run test:asaas-plan` (17 casos): referência, valor, status, cookies do GA,
  nunca rebaixa, originalValue, client_id de outro usuário nunca é usado,
  webhooks em paralelo mandam purchase uma vez, erro não prende a nota,
  ativação + purchase uma vez, webhook repetido, falha no meio com nova
  tentativa, segunda mensalidade sem purchase, depósito/pendente/valor errado
  não ativam, sem client_id não envia.
- `tsc` sem erro novo.
- Produção: assinatura de teste paga no Asaas → log `Plano ativado por
  pagamento Asaas`, `users.plan` atualizado, `payment_events` com
  `gaPurchaseNote = purchase_enviado`.

## Revisão Goldfish

| Rodada | Fase | Bloqueantes | Riscos | Resultado |
|---|---|---|---|---|
| 1 | Especificação + diff | 1 (falha na ativação respondia 200: Asaas não reenvia e quem pagou ficava no free) | 5 | Corrigido: erro responde 500 para reenvio. Também: fail-closed sem token, nunca rebaixa, originalValue, alerta de estorno, resposta sem userId, `engagement_time_msec`, nota do purchase nunca presa, comentário de concorrência honesto; testes para trava do purchase (paralelo), filtro por usuário, nunca rebaixa e originalValue, todos conferidos por mutação. Aceitos: ligação do webhook sem teste de integração; rebaixamento e cancelamento da assinatura antiga ficam para a próxima mudança. |
