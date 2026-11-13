# Programa de parceiros (comissao sobre mensalidade)

Parceiro indica a MecProAI e recebe comissao sobre a assinatura do indicado.

## Regra padrao
- 10% do valor efetivamente pago (`invoice.amount_paid`), nos 3 primeiros pagamentos (`maxPayments`).
- Carencia de 7 dias corridos (`holdDays`, minimo 7): art. 49 do CDC. Antes disso a comissao fica "em carencia" e nao pode ser paga.
- Repasse por Pix, minimo R$ 20,00, registrado em `/admin/affiliates` ("Registrar repasse").
- Reembolso total (`charge.refunded`): comissao pendente e cancelada; se ja paga, vira `clawback` e e descontada do proximo repasse. Reembolso parcial so gera nota para revisao manual.
- Credito de midia (`wallet_deposit`) nao gera comissao: so faturas de assinatura (`invoice.payment_succeeded`).

## Regras editaveis
Percentual (`commissionPct`), numero de pagamentos (`maxPayments`) e carencia (`holdDays`, minimo 7) sao definidos por parceiro: na criacao e depois em `/admin/affiliates` ("Editar regras", `trpc.affiliates.update`). A mudanca vale so para comissoes futuras; as ja geradas mantem valor e data de liberacao.

## Fluxo
1. Admin cria o parceiro (`trpc.affiliates.create`) e recebe o link `https://www.mecproai.com/register?ref=CODIGO`.
2. `main.tsx` guarda `?ref=` em localStorage (`mp_ref`); `Register.tsx` envia `ref` em `auth.register`; `attachReferral` vincula o usuario (1 parceiro por usuario, sem auto-indicacao, nunca bloqueia cadastro).
3. Webhook Stripe `invoice.payment_succeeded` -> `recordCommissionFromInvoice` (idempotente por `stripeInvoiceId`), em try/catch: comissao nunca bloqueia ativacao de plano.
4. Usuario de Google OAuth pode vincular depois com `trpc.affiliates.claim` (so se ainda nao assina).

## Tabelas (aditivas, `AFFILIATES_MIGRATION` no boot)
`affiliates`, `affiliate_referrals` (userId unico), `affiliate_commissions` (stripeInvoiceId unico).

## Autoatendimento do parceiro (11/11/2026)
Qualquer usuario logado pode virar parceiro sozinho, com as regras padrao (10%, 3 pagamentos, carencia 7):
- Pagina `/afiliados` (item "Afiliados" no menu lateral, chave de visibilidade `showAffiliate`): formulario "Quero ser afiliado" (nome, Pix, codigo opcional), link de indicacao, painel (indicados, carencia, liberado, pago) e ultimas comissoes.
- tRPC: `affiliates.me` (perfil + painel), `affiliates.join` (cadastro unico por usuario; `affiliates.userId`, migracao aditiva), `affiliates.updateMine` (parceiro so edita nome e Pix; percentual e carencia continuam so no admin).
- Auto-indicacao bloqueada tambem por `userId`, nao so por e-mail.
- Admin: `/admin/affiliates` tem link no menu do painel admin e no atalho Admin da sidebar comum.
- Login Google captura o `ref` guardado em `mp_ref` (ReferralClaimer chama `affiliates.claim`; PR #72).
- Migracao: o banco de producao tinha tabelas legadas de afiliados (snake_case, `ref_code`) que faziam o lote inteiro ser revertido. A `AFFILIATES_MIGRATION` remove o legado apenas quando vazio (confirmado aplicado em producao em 11/11; tabelas novas verificadas no banco).
- `markAffiliatePaid` trava as linhas (`FOR UPDATE`) e marca por id: chamadas simultaneas nao geram repasse fantasma nem limpam clawback duas vezes.

## Pontos nao confirmados
- Confirmar com um evento real que `invoice.customer` encontra o usuario por `users.stripeCustomerId`, e que `charge.invoice` / `charge.payment_intent` casam com a comissao no reembolso (a API do Stripe varia por versao).
- Fluxo de ponta a ponta ainda sem teste real: cadastro via `/afiliados`, indicacao por link, primeira fatura paga e repasse.
